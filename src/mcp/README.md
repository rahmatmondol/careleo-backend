# CareLeo MCP server

Exposes CareLeo to Claude Desktop, Cursor, Antigravity or any other MCP client:
the shop admin API, and the same assistant tools the in-app AI uses.

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
    "careleo": {
      "command": "/absolute/path/to/bun",
      "args": ["run", "/absolute/path/to/careleo-backend/src/mcp/index.ts"],
      "env": {
        "CARELEO_MCP_USER_EMAIL": "you@example.com"
      }
    }
  }
}
```

Both paths are absolute on purpose:

- **The command.** An MCP client does not inherit your shell's `PATH`, so a
  bare `"bun"` fails with `spawn bun ENOENT`. `which bun` gives you the path.
- **The script.** Clients differ on whether they honour a `cwd` setting, and
  Claude Desktop does not — a relative script path dies with
  `Module not found "src/mcp/index.ts"`.

There is deliberately no `cwd` requirement: the entrypoint reads `.env` from
its own location in the repo rather than from the working directory, so it
starts correctly wherever the client launches it from.

Locally you can also just run `bun run mcp`.

### Who the assistant tools act as

`CARELEO_MCP_USER_EMAIL` (or `CARELEO_MCP_USER_ID`) names the account the
assistant tools operate on. They read that user's pets, write their tasks, and
are gated by that user's subscription — a tool their plan does not include comes
back as an error saying so, exactly as it does in the app.

It has no default. An MCP session has no signed-in user, and picking an owner by
guessing would be worse than not offering the tools, so **without it the
assistant tools are not registered at all** and only the shop tools appear.

### Tools that are withheld by default

Five tools spend money or reach a real person, and an MCP client drives them
with nobody confirming the way the in-app assistant has somebody confirming:

`place_reorder` · `book_vet_appointment` · `auto_hire_freelancer` ·
`send_job_letter` · `send_notification`

They are registered only with `CARELEO_MCP_ALLOW_WRITES=true`. Everything else
— creating tasks and reminders, saving facts, medical records, vaccinations,
inventory — is ordinary data entry and is available as soon as an operator is
set.

## Shop tools

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

## Assistant tools

Every tool in `modules/ai/tools.ts` — 30 of them, over tasks, reminders, pets,
symptom history, care plans, orders, vets, medical records, vaccinations, food
inventory and freelancers — is registered from the same declarations the in-app
assistant uses, so the two can never drift apart. The JSON Schema on each
declaration is converted to the Zod shape the MCP SDK wants.

`executeTool` reports failure inside its JSON result rather than throwing; that
is translated into a tool error here, so an entitlement refusal or a missing
record reads as a failure instead of a successful blob.

Counts, for orientation:

| Configuration | Tools |
|---|---|
| no operator set | 8 (shop only) |
| operator set | 33 |
| operator set + `CARELEO_MCP_ALLOW_WRITES=true` | 38 |
