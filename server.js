import http from 'http';
import fs from 'fs';
import path from 'path';
import { createToken, hashPassword, verifyPassword, verifyToken } from './src/auth.js';
import { nextId, readDb, writeDb, ensureDb } from './src/db.js';

const port = process.env.PORT || 3000;
const publicDir = path.join(process.cwd(), 'public');

ensureDb();

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function getAuthedUserId(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = verifyToken(auth.slice(7));
  return payload?.id || null;
}

function serveStatic(req, res) {
  const filePath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(filePath).replace(/^\.+/, '');
  const absPath = path.join(publicDir, safePath);
  if (!absPath.startsWith(publicDir)) return false;
  if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) return false;
  const ext = path.extname(absPath);
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(absPath).pipe(res);
  return true;
}

async function handleApi(req, res) {
  const { url, method } = req;
  const db = readDb();

  if (url === '/api/auth/signup' && method === 'POST') {
    const { name, email, password } = await parseBody(req);
    if (!name || !email || !password || password.length < 8) return sendJson(res, 400, { error: 'Name, email and password (min 8 chars) are required.' });
    if (db.users.some((u) => u.email === email.toLowerCase())) return sendJson(res, 409, { error: 'Email already registered.' });
    const user = { id: nextId('u'), name, email: email.toLowerCase(), passwordHash: hashPassword(password), bio: 'Comic enthusiast exploring premium collectibles.', followers: [], following: [], wishlist: [] };
    db.users.push(user);
    writeDb(db);
    return sendJson(res, 201, { token: createToken({ id: user.id, email: user.email }), user: { ...user, passwordHash: undefined } });
  }

  if (url === '/api/auth/login' && method === 'POST') {
    const { email, password } = await parseBody(req);
    const user = db.users.find((u) => u.email === email?.toLowerCase());
    if (!user || !verifyPassword(password || '', user.passwordHash)) return sendJson(res, 401, { error: 'Invalid credentials.' });
    return sendJson(res, 200, { token: createToken({ id: user.id, email: user.email }), user: { ...user, passwordHash: undefined } });
  }

  if (url === '/api/products' && method === 'GET') {
    const categories = [...new Set(db.products.map((p) => p.category))];
    return sendJson(res, 200, { products: db.products, categories });
  }

  if (url.startsWith('/api/profile/') && method === 'GET') {
    const id = url.split('/').at(-1);
    const user = db.users.find((u) => u.id === id);
    if (!user) return sendJson(res, 404, { error: 'Profile not found.' });
    return sendJson(res, 200, { id: user.id, name: user.name, bio: user.bio, followers: user.followers.length, following: user.following.length, wishlistCount: user.wishlist.length });
  }

  const userId = getAuthedUserId(req);
  if (!userId && url.startsWith('/api/') && !url.startsWith('/api/auth/') && url !== '/api/products') return sendJson(res, 401, { error: 'Authentication required' });

  if (url.startsWith('/api/profile/follow/') && method === 'POST') {
    const targetId = url.split('/').at(-1);
    if (targetId === userId) return sendJson(res, 400, { error: 'Cannot follow yourself.' });
    const me = db.users.find((u) => u.id === userId);
    const target = db.users.find((u) => u.id === targetId);
    if (!me || !target) return sendJson(res, 404, { error: 'User not found.' });
    const following = me.following.includes(target.id);
    me.following = following ? me.following.filter((id) => id !== target.id) : [...me.following, target.id];
    target.followers = following ? target.followers.filter((id) => id !== me.id) : [...target.followers, me.id];
    writeDb(db);
    return sendJson(res, 200, { following: !following, followerCount: target.followers.length });
  }

  if (url === '/api/wishlist' && method === 'GET') {
    const user = db.users.find((u) => u.id === userId);
    return sendJson(res, 200, { items: db.products.filter((p) => user.wishlist.includes(p.id)) });
  }

  if (url.startsWith('/api/wishlist/') && method === 'POST') {
    const productId = url.split('/').at(-1);
    const user = db.users.find((u) => u.id === userId);
    if (!db.products.some((p) => p.id === productId)) return sendJson(res, 404, { error: 'Product not found.' });
    user.wishlist = user.wishlist.includes(productId) ? user.wishlist.filter((id) => id !== productId) : [...user.wishlist, productId];
    writeDb(db);
    return sendJson(res, 200, { wishlist: user.wishlist });
  }

  if (url.startsWith('/api/cart/') && method === 'POST') {
    const productId = url.split('/').at(-1);
    const { quantity = 1 } = await parseBody(req);
    const qty = Number(quantity);
    if (qty < 1) return sendJson(res, 400, { error: 'Invalid quantity.' });
    const product = db.products.find((p) => p.id === productId);
    if (!product) return sendJson(res, 404, { error: 'Product not found.' });
    db.carts[userId] ||= [];
    const existing = db.carts[userId].find((item) => item.productId === product.id);
    if (existing) existing.quantity += qty;
    else db.carts[userId].push({ productId: product.id, quantity: qty });
    writeDb(db);
    return sendJson(res, 200, { cart: db.carts[userId] });
  }

  if (url === '/api/cart' && method === 'GET') {
    const cart = db.carts[userId] || [];
    const detailed = cart.map((item) => {
      const product = db.products.find((p) => p.id === item.productId);
      return { ...item, product, lineTotal: item.quantity * product.price };
    });
    return sendJson(res, 200, { items: detailed, total: detailed.reduce((sum, item) => sum + item.lineTotal, 0) });
  }

  if (url === '/api/checkout' && method === 'POST') {
    const { shippingAddress, paymentMethod } = await parseBody(req);
    const cart = db.carts[userId] || [];
    if (!cart.length) return sendJson(res, 400, { error: 'Cart is empty.' });
    const items = cart.map((item) => {
      const p = db.products.find((prod) => prod.id === item.productId);
      return { ...item, price: p.price, title: p.title };
    });
    const order = {
      id: nextId('ord'),
      userId,
      items,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      paymentMethod: paymentMethod || 'Card',
      shippingAddress,
      status: 'Processing',
      timeline: [
        { phase: 'Order placed', timestamp: new Date().toISOString() },
        { phase: 'Payment confirmed', timestamp: new Date(Date.now() + 5 * 60_000).toISOString() },
        { phase: 'Preparing shipment', timestamp: new Date(Date.now() + 60 * 60_000).toISOString() }
      ]
    };
    db.orders.push(order);
    db.carts[userId] = [];
    writeDb(db);
    return sendJson(res, 201, { order });
  }

  if (url === '/api/orders' && method === 'GET') return sendJson(res, 200, { orders: db.orders.filter((o) => o.userId === userId) });

  if (url.startsWith('/api/orders/') && url.endsWith('/track') && method === 'GET') {
    const orderId = url.split('/')[3];
    const order = db.orders.find((o) => o.id === orderId && o.userId === userId);
    if (!order) return sendJson(res, 404, { error: 'Order not found.' });
    return sendJson(res, 200, { orderId: order.id, status: order.status, timeline: order.timeline });
  }

  if (url.startsWith('/api/offers/') && method === 'POST') {
    const productId = url.split('/').at(-1);
    const product = db.products.find((p) => p.id === productId);
    if (!product) return sendJson(res, 404, { error: 'Product not found.' });
    const { amount } = await parseBody(req);
    const offerAmt = Number(amount);
    if (!offerAmt || offerAmt <= 0) return sendJson(res, 400, { error: 'Offer amount must be positive.' });
    const offer = { id: nextId('offer'), userId, productId, amount: offerAmt, decision: offerAmt > product.price * 0.88 ? 'Likely accepted' : 'Under review', createdAt: new Date().toISOString() };
    db.offers.push(offer);
    writeDb(db);
    return sendJson(res, 201, { offer });
  }

  if (url === '/api/assistant' && method === 'POST') {
    const { question = '' } = await parseBody(req);
    const lower = question.toLowerCase();
    const userOrders = db.orders.filter((o) => o.userId === userId);
    const me = db.users.find((u) => u.id === userId);
    let answer = 'I can help with products, order tracking, offers, checkout, and account support.';
    if (lower.includes('order') || lower.includes('track')) answer = userOrders.length ? `You currently have ${userOrders.length} order(s). Most recent status: ${userOrders.at(-1).status}.` : 'You have no orders yet. Add items to cart and complete checkout to create one.';
    else if (lower.includes('recommend') || lower.includes('product')) {
      const pick = db.products[Math.floor(Math.random() * db.products.length)];
      answer = `Try “${pick.title}” in ${pick.category} at $${pick.price.toFixed(2)}. ${pick.description}`;
    } else if (lower.includes('offer')) answer = 'Use “Make an Offer” on any product card. Offers near 88% of listed price are usually approved faster.';
    else if (lower.includes('wishlist')) answer = `You have ${me.wishlist.length} item(s) in your wishlist. Tap the heart icon to manage it.`;
    return sendJson(res, 200, { answer });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  if (serveStatic(req, res)) return;
  const index = fs.readFileSync(path.join(publicDir, 'index.html'));
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(index);
});

server.listen(port, '0.0.0.0', () => console.log(`Comiking server running on http://0.0.0.0:${port}`));
