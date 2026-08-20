# CareLeo shop MCP server

Exposes the shop admin API — products, categories, brands, attributes — as MCP
tools for Claude Desktop, Cursor, Antigravity or any other MCP client.

## Why it lives here

It used to be a standalone project (`careleo-mcp/shop-manager`) that logged in
as an admin over HTTP and called `/api/v1/shop/admin/*`. It calls the shop
services directly now, which removes:

- **the admin credentials.** They sat in plain text in the MCP client's config
  file purely so the server could get a token for itself. There are none now.
- **the network hop**, and the response-envelope handling it re-implemented.
- **a second copy of the API's shape**, which drifted whenever the backend moved
  — it defaulted to the api-gateway on `:8090` long after the gateway was gone.

It is a **separate entrypoint, not an HTTP route** on the running server: MCP
stdio requires the client to spawn the process, and putting admin tools on a
network port would need an auth story this does not need to have.

## Prerequisites

Only what the backend itself needs: `bun install`, and a reachable
`DATABASE_URL` in `.env`. The API server does **not** have to be running — this
talks to the database, not to `:3000`.

## Client configuration

```json
{
  "mcpServers": {
    "careleo-shop": {
      "command": "bun",
      "args": ["run", "src/mcp/index.ts"],
      "cwd": "/absolute/path/to/careleo-backend"
    }
  }
}
```

`cwd` matters: Bun loads `.env` from the working directory, and that is where
`DATABASE_URL` comes from.

Locally you can also just run `bun run mcp`.

## Tools

| Tool | Does |
|------|------|
| `list-products` | List products; optional `search`, `categoryId`, `brandId`, `page`, `limit` |
| `create-product` | Create a product |
| `list-categories` | List product categories |
| `create-category` | Create a category |
| `list-brands` | List brands |
| `create-brand` | Create a brand |
| `list-attributes` | List product attributes |
| `create-attribute` | Create an attribute (Size, Color, …) |

A service that answers `{ error, status }` — "Brand already exists", "Not
found" — is returned to the model as a tool error rather than as a success
payload with an `error` key inside it.

## Extending it

`modules/ai/tools.ts` already declares ~25 tools over tasks, reminders, pets,
vets, medical records, vaccinations, inventory and freelancers, dispatched by
`executeTool`. Exposing that registry here would give an MCP client the same
reach the in-app assistant has. It needs one decision first: `executeTool` is
scoped to a `userId`, and an MCP session has no signed-in user, so whose data it
operates on has to be settled deliberately.
