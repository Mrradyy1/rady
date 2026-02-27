# Comiking

Comiking is a premium full-stack eCommerce experience for comic lovers and collectors.

## Features
- Classic/elegant typography with a cinematic hero banner.
- Smooth light/dark mode transitions.
- Secure sign-up/login with hashed passwords and signed auth tokens.
- User profiles with followers/following.
- Dynamic product shelves and category filtering.
- Wishlist management.
- Add-to-cart and checkout flow.
- Order tracking timeline.
- Make-an-offer workflow.
- Built-in AI concierge endpoint for product/order/support Q&A.
- Subtle interaction sound effects + motion-rich UI.

## Run
```bash
node server.js
```

Open `http://localhost:3000`.

## Actual demo walkthrough
In terminal 1:
```bash
node server.js
```

In terminal 2 (runs end-to-end API demo automatically):
```bash
./scripts/demo-flow.sh http://127.0.0.1:3000
```

Then open `http://127.0.0.1:3000` in your browser and click **Demo Login**.

## Test
```bash
npm test
```
