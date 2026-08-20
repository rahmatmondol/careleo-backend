/**
 * CareLeo shop MCP server.
 *
 * Exposes the shop admin API — products, categories, brands, attributes — as
 * MCP tools for Claude Desktop, Cursor and anything else that speaks stdio.
 *
 * This used to be a standalone project (`careleo-mcp/shop-manager`) that logged
 * in as an admin over HTTP and called `/api/v1/shop/admin/*`. Living in the
 * backend it calls the shop services directly, which removes three things:
 *
 *  - the admin email and password, which sat in plain text in the MCP client's
 *    config file purely so the server could obtain a token for itself;
 *  - the network hop and the response-envelope handling it re-implemented;
 *  - a second copy of the API's shape, which drifted whenever the backend moved
 *    (it defaulted to the api-gateway on :8090 well after the gateway was gone).
 *
 * It is a separate entrypoint, not an HTTP route on the running server: MCP
 * stdio requires the client to spawn the process, and mounting admin tools on a
 * network port would need an auth story this does not need to have.
 *
 * Run:  bun run mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { and, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { roles, userRoles, users } from '@/shared/db/schema';
import { AI_TOOL_DECLARATIONS, executeTool } from '@/modules/ai/tools';
import * as attributeService from '@/modules/shop/services/admin/attribute.service';
import * as brandService from '@/modules/shop/services/admin/brand.service';
import * as categoryService from '@/modules/shop/services/admin/category.service';
import * as productService from '@/modules/shop/services/admin/product.service';

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

/**
 * The shop services return `{ ...data, status?, error? }` rather than throwing —
 * the convention every merged module kept. `unwrap()` translates that at the
 * HTTP boundary; this is the same translation for the MCP boundary, so a
 * "Brand already exists" comes back to the model as a tool error instead of
 * a success payload with an `error` key in it.
 */
async function run(work: () => Promise<any>): Promise<ToolResult> {
  try {
    const result = await work();
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      return {
        content: [{ type: 'text', text: `Error: ${result.error}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e: any) {
    return {
      content: [{ type: 'text', text: `Error: ${e?.message ?? 'Unknown error'}` }],
      isError: true,
    };
  }
}

const server = new McpServer({
  name: 'careleo-mcp',
  version: '3.0.0',
});

// ─── Products ───────────────────────────────────────────────────────────────

server.tool(
  'list-products',
  'List shop products, optionally filtered by category, brand or a search term',
  {
    search: z.string().optional(),
    categoryId: z.string().optional(),
    brandId: z.string().optional(),
    page: z.number().optional(),
    limit: z.number().optional(),
  },
  async (args) => run(() => productService.listProducts(args)),
);

server.tool(
  'create-product',
  'Create a new product',
  {
    name: z.string(),
    description: z.string().optional(),
    price: z.number(),
    categoryId: z.string().optional(),
    brandId: z.string().optional(),
    stock: z.number().optional(),
    isActive: z.boolean().optional(),
  },
  async (args) => run(() => productService.createProduct(args)),
);

// ─── Categories ─────────────────────────────────────────────────────────────

server.tool(
  'list-categories',
  'List all product categories',
  {},
  async () => run(() => categoryService.listCategories()),
);

server.tool(
  'create-category',
  'Create a new product category',
  {
    name: z.string(),
    description: z.string().optional(),
    parentId: z.string().optional(),
    isActive: z.boolean().optional(),
  },
  async (args) => run(() => categoryService.createCategory(args)),
);

// ─── Brands ─────────────────────────────────────────────────────────────────

server.tool(
  'list-brands',
  'List all brands',
  {},
  async () => run(() => brandService.listBrands()),
);

server.tool(
  'create-brand',
  'Create a new brand',
  {
    name: z.string(),
    description: z.string().optional(),
    website: z.string().optional(),
    isActive: z.boolean().optional(),
  },
  async (args) => run(() => brandService.createBrand(args)),
);

// ─── Attributes ─────────────────────────────────────────────────────────────

server.tool(
  'list-attributes',
  'List all product attributes',
  {},
  async () => run(() => attributeService.listAttributes()),
);

server.tool(
  'create-attribute',
  'Create a new attribute (e.g. Size, Color)',
  {
    name: z.string(),
    code: z.string(),
    inputType: z.string().optional(),
    isRequired: z.boolean().optional(),
  },
  async (args) => run(() => attributeService.createAttribute(args)),
);

// ─── CareLeo assistant tools ────────────────────────────────────────────────

/**
 * Tools that spend money or reach a real person. They are registered only when
 * `CARELEO_MCP_ALLOW_WRITES` is set, because an MCP client drives them with no
 * human confirming the way the in-app assistant has one: placing an order,
 * booking a vet, hiring a freelancer and sending a notification are all things
 * you cannot take back by editing a row.
 */
const SIDE_EFFECT_TOOLS = new Set([
  'place_reorder',
  'book_vet_appointment',
  'auto_hire_freelancer',
  'send_job_letter',
  'send_notification',
]);

type JsonSchemaProp = { type?: string; description?: string; items?: { type?: string } };

/**
 * The AI tool declarations carry JSON Schema; the MCP SDK wants a Zod shape.
 * The declarations use a small subset — string, number, boolean and one array
 * of string — so this covers it and falls back to a permissive value for
 * anything added later, rather than dropping the field.
 */
function toZodShape(parameters: any): Record<string, z.ZodTypeAny> {
  const props: Record<string, JsonSchemaProp> = parameters?.properties ?? {};
  const required: string[] = Array.isArray(parameters?.required) ? parameters.required : [];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(props)) {
    let field: z.ZodTypeAny;
    switch (prop?.type) {
      case 'number':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        field = z.array(prop.items?.type === 'number' ? z.number() : z.string());
        break;
      case 'string':
        field = z.string();
        break;
      default:
        field = z.any();
    }
    if (prop?.description) field = field.describe(prop.description);
    shape[key] = required.includes(key) ? field : field.optional();
  }

  return shape;
}

/**
 * Whose data the assistant tools operate on.
 *
 * `executeTool` is scoped to a user — it reads their pets, writes their tasks
 * and checks their plan's entitlements — and an MCP session has no signed-in
 * user, so the operator names one explicitly. Without it the assistant tools
 * are simply not registered: guessing an owner would be worse than not
 * offering the tools.
 */
async function resolveOperator(): Promise<{ id: string; email: string; role: string } | null> {
  const wantedId = process.env.CARELEO_MCP_USER_ID?.trim();
  const wantedEmail = process.env.CARELEO_MCP_USER_EMAIL?.trim().toLowerCase();
  if (!wantedId && !wantedEmail) return null;

  const rows = await db
    .select({ id: users.id, email: users.email, role: roles.code })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(wantedId ? eq(users.id, wantedId) : eq(users.email, wantedEmail!))
    .limit(1);

  const row = rows[0];
  return row ? { id: row.id, email: row.email, role: row.role ?? 'customer' } : null;
}

async function registerAssistantTools() {
  const operator = await resolveOperator();
  if (!operator) {
    console.error(
      '[MCP] CARELEO_MCP_USER_ID / CARELEO_MCP_USER_EMAIL not set (or no such user) — ' +
        'assistant tools are not registered. Shop tools are unaffected.',
    );
    return;
  }

  const allowWrites = process.env.CARELEO_MCP_ALLOW_WRITES === 'true';
  let registered = 0;
  let withheld = 0;

  for (const declaration of AI_TOOL_DECLARATIONS) {
    if (SIDE_EFFECT_TOOLS.has(declaration.name) && !allowWrites) {
      withheld++;
      continue;
    }

    server.tool(
      declaration.name,
      declaration.description,
      toZodShape(declaration.parameters),
      async (args: Record<string, any>) =>
        run(async () => {
          // executeTool returns a JSON string and reports failure inside it;
          // surface that as a tool error rather than a successful blob.
          const raw = await executeTool(declaration.name, args ?? {}, operator.id);
          const parsed = JSON.parse(raw);
          if (parsed?.success === false) {
            throw new Error(parsed.message ?? parsed.error ?? 'Tool failed');
          }
          return parsed;
        }),
    );
    registered++;
  }

  console.error(
    `[MCP] Assistant tools: ${registered} registered as ${operator.email} (${operator.role})` +
      (withheld ? `, ${withheld} withheld — set CARELEO_MCP_ALLOW_WRITES=true to enable them` : ''),
  );
}

async function main() {
  // stdout is the MCP transport — everything human goes to stderr.
  console.error('[MCP] Starting CareLeo MCP server...');
  await registerAssistantTools();
  await server.connect(new StdioServerTransport());
  console.error('[MCP] Server is running on stdio.');
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
