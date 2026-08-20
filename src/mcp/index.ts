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
  name: 'careleo-shop-manager',
  version: '2.0.0',
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

async function main() {
  // stdout is the MCP transport — everything human goes to stderr.
  console.error('[MCP] Starting CareLeo shop manager...');
  await server.connect(new StdioServerTransport());
  console.error('[MCP] Server is running on stdio.');
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
