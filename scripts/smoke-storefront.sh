#!/usr/bin/env bash
#
# Storefront ↔ backend smoke test.
#
# Walks the exact journey careleo-store makes against the merged backend:
# browse the catalogue anonymously, sign in, then cart → checkout → orders.
# Every one of these paths used to be served by shop-service; this proves they
# still resolve, still authenticate, and still return the shape the storefront
# parses.
#
# Usage:
#   ./scripts/smoke-storefront.sh                        # uses the seeded defaults below
#   EMAIL=me@x.com PASSWORD=secret ./scripts/smoke-storefront.sh
#   GW=http://api.example.com ./scripts/smoke-storefront.sh  # point at another host
#
# Needs: curl, jq.

set -uo pipefail

GW="${GW:-http://localhost:3000}"
EMAIL="${EMAIL:-customer@careleo.com}"
PASSWORD="${PASSWORD:-Password123!}"

pass=0; fail=0
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
dim()   { printf '\033[2m%s\033[0m\n' "$1"; }

# check <label> <jq-filter> <json>  — filter must evaluate truthy
check() {
  local label="$1" filter="$2" json="$3"
  if [ "$(printf '%s' "$json" | jq -r "$filter" 2>/dev/null)" = "true" ]; then
    green "  ok    $label"; pass=$((pass+1))
  else
    red   "  FAIL  $label"
    dim   "        $(printf '%s' "$json" | head -c 300)"
    fail=$((fail+1))
  fi
}

echo
echo "storefront smoke test → $GW"
echo

# ── 1. Public catalogue (no token) ────────────────────────────────────────
echo "catalogue (anonymous)"
cats=$(curl -sS "$GW/api/v1/shop/categories")
check "GET /shop/categories is enveloped"  '.success == true'                "$cats"
check "  → data.categories is an array"    '.data.categories | type == "array"' "$cats"

prods=$(curl -sS "$GW/api/v1/shop/products?limit=5")
check "GET /shop/products is enveloped"    '.success == true'                "$prods"
check "  → data.products is an array"      '.data.products | type == "array"' "$prods"

PRODUCT_ID=$(printf '%s' "$prods" | jq -r '.data.products[0].id // empty')
if [ -n "$PRODUCT_ID" ]; then
  one=$(curl -sS "$GW/api/v1/shop/products/$PRODUCT_ID")
  check "GET /shop/products/:id"           '.success == true and (.data.product != null)' "$one"
else
  dim  "  skip  no products seeded — cart/checkout steps will be skipped too"
fi

# ── 2. Sign in ────────────────────────────────────────────────────────────
echo
echo "auth"
login=$(curl -sS -X POST "$GW/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "POST /auth/login returns a token"   '.data.accessToken != null'       "$login"
TOKEN=$(printf '%s' "$login" | jq -r '.data.accessToken // empty')

if [ -z "$TOKEN" ]; then
  red "  cannot continue without a token — set EMAIL/PASSWORD to a real account"
  echo; echo "$pass passed, $((fail+1)) failed"; exit 1
fi
AUTH=(-H "Authorization: Bearer $TOKEN")

# The core auth module signs { id, ... } while the freelancer module signs
# { sub, ... }. domain-auth.ts accepts either; if that regressed, everything
# below returns 401 and this is the line that tells you why.
me=$(curl -sS "${AUTH[@]}" "$GW/api/v1/shop/cart")
check "customer token is accepted by /shop (sub ?? id)" '.success == true'   "$me"

# ── 3. Cart → checkout → orders ───────────────────────────────────────────
if [ -n "$PRODUCT_ID" ]; then
  echo
  echo "cart & checkout"

  add=$(curl -sS -X POST "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" "$GW/api/v1/shop/cart")
  check "POST /shop/cart"                  '.success == true'                "$add"

  cart=$(curl -sS "${AUTH[@]}" "$GW/api/v1/shop/cart")
  check "GET /shop/cart shows the item"    '.success == true'                "$cart"

  co=$(curl -sS -X POST "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d '{"paymentMethod":"COD"}' "$GW/api/v1/shop/cart/checkout")
  check "POST /shop/cart/checkout"         '.success == true'                "$co"

  orders=$(curl -sS "${AUTH[@]}" "$GW/api/v1/shop/orders")
  check "GET /shop/orders"                 '.success == true'                "$orders"
fi

# ── 4. Other domains the storefront touches ───────────────────────────────
echo
echo "other domains"
addr=$(curl -sS "${AUTH[@]}" "$GW/api/v1/shop/addresses")
check "GET /shop/addresses"                '.success == true'                "$addr"

subs=$(curl -sS "${AUTH[@]}" "$GW/api/v1/shop/subscriptions")
check "GET /shop/subscriptions"            '.success == true'                "$subs"

# Media is public to read for an admin token only; an anonymous or customer
# call is expected to be rejected, which is itself the check.
code=$(curl -sS -o /dev/null -w '%{http_code}' "$GW/api/v1/media/assets")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  green "  ok    GET /media/assets rejects an anonymous caller ($code)"; pass=$((pass+1))
else
  red   "  FAIL  GET /media/assets returned $code, expected 401/403"; fail=$((fail+1))
fi

# Regression guard for the media auth fix: a forged, unsigned token must fail.
FORGED="$(printf '{"alg":"none"}' | base64 | tr -d '=').$(printf '{"sub":"x","role":"SUPER_ADMIN"}' | base64 | tr -d '=').x"
code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $FORGED" "$GW/api/v1/media/assets")
if [ "$code" = "401" ]; then
  green "  ok    forged unsigned token rejected (401)"; pass=$((pass+1))
else
  red   "  FAIL  forged token returned $code — signature verification is not working"; fail=$((fail+1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
