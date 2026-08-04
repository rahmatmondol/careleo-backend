# Merging the services back into careleo-backend

The five standalone services — **shop, social, video, media, freelancer** — are
now modules inside `careleo-backend`. This document covers what changed, how to
run the migration against an existing environment, and the handful of things
that were deliberately *not* changed.

`migration-rollout.md` (the playbook for splitting them out) is superseded by
this document for those five services.

---

## 1. Why

The split had produced a distributed monolith rather than independent services:

- **Every write crossed a network boundary.** Creating a product was three hops:
  careleo-backend → shop-service → media-service. No transaction spanned them,
  so a failure halfway left orphan rows.
- **Reads opened a second database.** `orders.service.ts` built a fresh `pg`
  Pool to `careleo` on *every* admin order listing just to resolve customer
  names, because `orders` (in `careleo_shop`) could not join `users` (in
  `careleo`). Failures were swallowed into an empty map, which is why the code
  still carries a placeholder-name fallback.
- **Nothing enforced referential integrity.** `cart_items.user_id` was an
  unconstrained uuid. A deleted user left live cart rows behind.
- **Four copies of the same middleware.** Auth, the DB client, the error
  envelope and the role table were duplicated per service; an RBAC change meant
  four edits.
- **Size.** shop was ~1,900 lines across 50 files, media ~820 across 20 —
  modules that had been given their own process, image, database and deploy.

Against ~6,500 lines total, the coordination cost outweighed any independence
benefit.

---

## 2. What changed

| Area | Before | After |
|---|---|---|
| Processes | 7 (gateway + backend + 5 services) | 1 (backend) |
| Databases | `careleo` + 5 `careleo_*` | `careleo` only |
| Public URLs | `/api/v1/{shop,social,video,media,freelancer}/*` | **identical** |
| Route count | 169 | **169** — verified, none dropped or added |
| Response shape | each service's own | app-wide `{ success, data, error }` |
| Service-to-service | HTTP + `x-internal-secret` | in-process function calls |

### Code layout

```
src/modules/shop/         controllers · services · routes · guards · jobs
src/modules/social/       feed posts comments likes follows shares …
src/modules/video/        consultations cameras sessions admin
src/modules/media/        handlers · storage(local|s3) · routes · guards
src/modules/freelancer/   auth profiles services jobs bookings earnings support
src/shared/db/schema/{shop,social,video,media,freelancer}.schema.ts
```

Three shared pieces were added to carry the merged code:

- **`shared/http/service-result.ts`** — the merged services report failures as
  values (`{ status: 404, error: '…' }`) rather than by throwing. `unwrap()`
  (aliased `fwd`) translates that at the controller boundary: throw on failure,
  return the bare payload on success. Without it every merged response would go
  out double-nested as `{ success: true, data: { data: … } }`.
- **`shared/auth/domain-auth.ts`** — one verified-JWT derive replacing four
  copies. It derives an **optional** `user`, because many merged routes are
  public reads that behave differently when signed in; `requireUser` /
  `requireAdmin` / `requireFreelancer` are what make a route mandatory.
- **`shared/db/sql.ts`** — a `postgres.js`-compatible tagged template running on
  the shared `pg` pool, so media's hand-written SQL (CTEs, `COUNT(*) FILTER`)
  could move over without being re-derived in Drizzle. Interpolations still
  become bound parameters. Use Drizzle for new queries.

### Database

All 38 tables merged into `careleo` with **zero name collisions**. Columns that
were bare uuids across a database boundary are real foreign keys now:
`cart_items.user_id`, `orders.user_id`, `posts.user_id`, `jobs.customer_id`,
`expenses.pet_id`, and the rest. Migration `0008_premium_invaders.sql` is purely
additive — 40 `CREATE TABLE`, no drops.

Four columns were deliberately **left unconstrained**, each for a reason worth
knowing:

| Column | Why no FK |
|---|---|
| `order_items.product_id` | An order line is a point-in-time snapshot (`productName`, `price` copied in) and must survive the product being delisted. |
| `video_consultations.vet_id` | Historical rows can reference vet ids that never existed in `vets`. Promote once `--orphans` reports it clean. |
| `support_tickets.raised_by` / `assigned_to`, `support_messages.sender_id` | Polymorphic — a `users.id` or a `freelancer_accounts.id` depending on the sibling `*Role` column. |
| `media_links.entity_id` | Polymorphic — `entity_type` names the owning table. |

Order rows (`orders`, `jobs`, `bookings`, `earnings`) reference `users` with no
`ON DELETE` clause: they are financial records and must not disappear with a
user row. Users are soft-deleted via `users.status` and never hard-deleted, so
the restrictive default never blocks anything in practice.

---

## 3. Running the migration

From `careleo-backend/`, with `DATABASE_URL` pointing at `careleo`:

```bash
bun install                                        # picks up @aws-sdk/client-s3 (media S3 driver)
bun run db:migrate                                 # applies 0008 — creates the merged tables

bun run scripts/migrate-service-dbs.ts --orphans   # integrity check, writes nothing
bun run scripts/migrate-service-dbs.ts --dry-run   # row counts, writes nothing
bun run scripts/migrate-service-dbs.ts             # copy the data across

docker compose -f docker-compose.hybrid.yml up -d --remove-orphans
```

**`--orphans` first, always.** The per-service databases had no foreign keys to
`users` or `pets`, so a row that was fine in isolation can be rejected by the
merged schema. The script refuses to copy while any blocking orphan exists and
tells you exactly which rows and which ids. Fix them (delete, or create the
missing parent) and re-run.

The copy is idempotent (`ON CONFLICT (id) DO NOTHING`), transactional per source
database, and finishes with two checks: every foreign key validated, and every
table's row count matched against its source.

The old `careleo_shop` / `_social` / `_video` / `_media` / `_freelancer`
databases are **left untouched**. Drop them only after verifying the merged data
and taking a backup — they are the rollback path.

### Rollback

The whole `services/` directory is **deleted** — the five services and the
api-gateway. Nothing built or imported any of it. It is recoverable in one
command:

```bash
git checkout <pre-merge-ref> -- careleo-backend/services/
```

Nothing in the data migration is destructive, so rollback is: restore that
directory, redeploy the previous backend image, bring the gateway and service
containers back up, and point the storefront's `API_GATEWAY_URL` back at :8090.
The old `careleo_*` databases still hold the data they held at cutover — which
is why the migration script leaves them alone. Writes accepted by the merged
backend after cutover live only in `careleo`, so rolling back loses them; keep
the window short.

---

## 4. Behaviour changes

Three, all intentional.

### 4.1 Response envelope — every merged endpoint

`/api/v1/{shop,social,video,media,freelancer}/*` now return
`{ success, data, error }` like the rest of the API, where they used to return
bare shapes.

Clients were updated:

- **careleo-app** — no change needed. `handleResponse` in
  `src/services/api/client.ts` already unwrapped the envelope generically.
- **careleo-admin** — social, video and freelancer routes already tolerated both
  shapes via `unwrap()`. Thirteen shop routes were updated to use the new
  `unwrapEnvelope()` in `src/lib/gateway.ts`.
- **careleo-store** — nine routes already went through `apiFetch`, which
  unwraps. Three catalogue routes (`products`, `products/[id]`, `categories`)
  were switched from bare `fetch` to `apiFetch`.

`unwrapEnvelope` and `apiFetch` both pass a non-enveloped body straight through,
so the frontends work against either shape and can be deployed independently of
the backend.

### 4.2 Media now verifies JWT signatures ⚠️

media-service did **not** verify signatures. Its `getUser()` base64-decoded the
token payload and trusted the `role` it found:

```ts
const payload = JSON.parse(Buffer.from(padded, 'base64').toString());
return { id: payload.sub ?? payload.id, role: payload.role };
```

Any client could mint `{"sub":"x","role":"SUPER_ADMIN"}`, base64 it, and get
full `media.manage` access — upload, overwrite, delete — on an endpoint exposed
through the public gateway.

Merged in, media uses the same verified `domainAuth` as every other module.
Forged tokens get 401; legitimate clients already send real tokens and are
unaffected. The `x-internal-key` bypass (`INTERNAL_SERVICE_KEY`, defaulting to
the hard-coded string `pawly-internal`) is gone with it — shop-service was its
only caller and it calls the handlers in-process now.

**Worth auditing:** if anything outside this repo was relying on that bypass, it
will start getting 401s.

### 4.3 Media local-storage defaults

`MEDIA_LOCAL_UPLOAD_DIR` was `/app/uploads/media`, the absolute path inside the
media-service image; it is now `./uploads/media` relative to the backend's
working directory. `MEDIA_PUBLIC_BASE_URL` was
`http://localhost:3017/uploads/media`, pointing at the retired service *and* at
a path it never served — uploads were always read back through
`/api/v1/media/files/*`, which the default now matches.

Both remain env-overridable, and docker-compose still mounts the
`careleo_media_uploads` volume, so existing files survive. **Existing
`media_assets.url` values are stored absolute and are not rewritten.** Rows
created before the merge keep whatever origin they were created with; set
`MEDIA_PUBLIC_BASE_URL` to the same public origin you used before to keep old
and new URLs consistent, or backfill the column.

---

## 5. Deliberately unchanged

Things a reader might expect the merge to have tidied up, and why it did not.

**`freelancer_accounts` was not folded into `users`.** Freelancers sign up
through the marketplace's own `/freelancer/register`, with separate
verification and payout flows. Keeping them separate is a product decision, not
an artifact of the service split, so the merge left it alone. The consequence is
the polymorphic support-ticket columns described above.

**The shop and media role tables were not unified with `shared/auth/rbac.ts`.**
They disagree: the shop and media tables are keyed on
`SUPER_ADMIN / OWNER / ADMIN / MANAGER / STAFF`; the app-wide one on
`super_admin / admin / support / customer`. Unifying them would silently change
who can reach admin catalogue and media endpoints. Note the practical effect of
that mismatch today: a `support` or `customer` role uppercases to `SUPPORT` /
`CUSTOMER`, which are absent from the shop table, so those roles get **no shop
permissions**. That is pre-existing behaviour, preserved here. Reconciling the
three tables deserves its own change with its own testing.

**The `/shop/internal/*` and `/freelancer/internal/*` routes still exist.**
Nothing in this repo calls them — `shop-client.ts` and `freelancer-client.ts`
are in-process facades now — but they are kept, still guarded by
`INTERNAL_SERVICE_SECRET`, for the deployment window where an older container
might still be posting to them. Delete them, and the env var, once nothing does.

**The api-gateway is gone too.** Once every domain lived in one process it was
a bare `/api/v1/*` passthrough to a single upstream. Of its three jobs, this app
already did two — CORS and Swagger — and the third, the 100 req/min rate limit,
moved into `src/app.ts` (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`). Keeping it
would have meant one more container, one more hop and one more place for a
route to disappear, in exchange for nothing.

The visible consequence is the port: **clients that used :8090 now use :3000.**
careleo-admin and careleo-app already pointed at :3000 directly; only
careleo-store went through the gateway, and its `.env.local`, `next.config.ts`
image host list and `lib/gateway.ts` default were updated. The
`API_GATEWAY_URL` variable name is kept in both frontends so existing
deployments keep working — it just points at the backend.

---

## 6. Verifying the port

Route parity was checked mechanically by extracting every `.get/.post/.put/
.patch/.delete` path (with its enclosing `.group()` prefix) from the old
services and from the merged modules:

```
old routes: 169   merged routes: 169
dropped: (none)   added: (none)
```

Also green: `bun run typecheck` on the backend, `npx tsc --noEmit` on
careleo-admin and careleo-store, and a check that all 51 named Elysia plugins
are unique — the merge introduced three `admin-controller`s and two
`notifications-controller`s, which Elysia deduplicates **by name**, silently
dropping routes. All merged plugins are namespaced (`social-admin-controller`,
`freelancer-jobs-controller`, …).

### Token shape — the one that breaks everything quietly

Two token shapes are in circulation and `shared/auth/domain-auth.ts` must accept
both:

| Issuer | Claim carrying the user id |
|---|---|
| `modules/auth` (`/auth/login`, customers) | `id` |
| `modules/freelancer/auth` (`/freelancer/auth/login`) | `sub` |

shop-service handled this with an explicit `payload.sub ?? payload.id`;
social-service and video-service read only `sub`, which is why *their*
authenticated routes never worked with a customer token. The merged
`domainAuth` uses the `sub ?? id` fallback, so a customer token now works
everywhere.

If this regresses, the failure is silent and total for signed-in storefront
users: `user` derives as `null`, every `requireUser` route returns 401, and
cart / checkout / orders / addresses all break at once while the public
catalogue keeps working. `scripts/smoke-storefront.sh` checks it explicitly.

### Smoke test after cutover

`scripts/smoke-storefront.sh` walks the whole storefront journey — anonymous
catalogue, login, cart, checkout, orders, addresses, subscriptions — plus the
media auth regression guard:

```bash
EMAIL=you@example.com PASSWORD=... ./scripts/smoke-storefront.sh
```

Or by hand:

One endpoint per merged domain, expecting `{ success: true, data: … }`:

```bash
GW=http://localhost:8090
TOKEN=...   # from POST $GW/api/v1/auth/login

curl -s $GW/api/v1/shop/products | jq '.success, (.data.products | length)'
curl -s $GW/api/v1/social/feed -H "Authorization: Bearer $TOKEN" | jq '.success'
curl -s $GW/api/v1/video/consultations -H "Authorization: Bearer $TOKEN" | jq '.success'
curl -s $GW/api/v1/media/assets -H "Authorization: Bearer $TOKEN" | jq '.success'
curl -s $GW/api/v1/freelancer/services | jq '.success'

# 4.2 regression check — a forged, unsigned token must now be rejected
FORGED=$(printf '{"alg":"none"}' | base64)."$(printf '{"sub":"x","role":"SUPER_ADMIN"}' | base64)".x
curl -s -o /dev/null -w '%{http_code}\n' $GW/api/v1/media/assets -H "Authorization: Bearer $FORGED"
# expect 401
```
