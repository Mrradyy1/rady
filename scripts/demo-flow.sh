#!/usr/bin/env bash
set -euo pipefail

export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/root/.nvm/versions/node/v22.21.1/bin"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node is required to parse JSON in demo script." >&2
  exit 1
fi

BASE_URL="${1:-http://127.0.0.1:3000}"
EMAIL="demo.$(date +%s)@comiking.com"
PASSWORD="demoPass123"

json_field() {
  "$NODE_BIN" -e 'const fs=require("fs");const obj=JSON.parse(fs.readFileSync(0,"utf8"));const path=process.argv[1].split(".");let v=obj;for(const p of path){v=v?.[p]}process.stdout.write(String(v??""));' "$1"
}

echo "[1/6] Signup demo account: $EMAIL"
SIGNUP=$(curl -sS -X POST "$BASE_URL/api/auth/signup" -H 'content-type: application/json' -d "{\"name\":\"Demo User\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$SIGNUP" | json_field token)
USER_ID=$(printf '%s' "$SIGNUP" | json_field user.id)
echo "    user_id=$USER_ID"

echo "[2/6] Load product catalog"
PRODUCTS=$(curl -sS "$BASE_URL/api/products")
PRODUCT_ID=$(printf '%s' "$PRODUCTS" | json_field products.0.id)
echo "    selected_product=$PRODUCT_ID"

echo "[3/6] Add to wishlist"
curl -sS -X POST "$BASE_URL/api/wishlist/$PRODUCT_ID" -H "authorization: Bearer $TOKEN" >/dev/null

echo "[4/6] Add to cart"
curl -sS -X POST "$BASE_URL/api/cart/$PRODUCT_ID" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"quantity":1}' >/dev/null

echo "[5/6] Checkout"
ORDER=$(curl -sS -X POST "$BASE_URL/api/checkout" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"shippingAddress":"221B Baker Street","paymentMethod":"Card"}')
ORDER_ID=$(printf '%s' "$ORDER" | json_field order.id)
echo "    order_id=$ORDER_ID"

echo "[6/6] Ask AI assistant"
ASSISTANT=$(curl -sS -X POST "$BASE_URL/api/assistant" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"question":"track my order"}')
ANSWER=$(printf '%s' "$ASSISTANT" | json_field answer)
echo "    ai_answer=$ANSWER"

echo
echo "Demo flow complete. Open $BASE_URL in your browser and click 'Demo Login' to explore UI features."
