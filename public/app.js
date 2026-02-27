const state = {
  token: localStorage.getItem('comikingToken') || '',
  user: JSON.parse(localStorage.getItem('comikingUser') || 'null'),
  products: [],
  categories: [],
  category: 'All'
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const headers = () => (state.token ? { Authorization: `Bearer ${state.token}` } : {});

function beep(frequency = 600, duration = 0.04) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  gain.gain.value = 0.02;
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers(),
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderTabs() {
  const tabs = ['All', ...state.categories];
  $('#categoryTabs').innerHTML = tabs
    .map((c) => `<button class="btn ${c === state.category ? '' : 'ghost'}" data-cat="${c}">${c}</button>`)
    .join('');
  $$('#categoryTabs button').forEach((b) => {
    b.onclick = () => {
      state.category = b.dataset.cat;
      beep(500);
      renderProducts();
      renderTabs();
    };
  });
}

function productCard(p) {
  return `<article class="card">
    <img src="${p.image}" alt="${p.title}" />
    <div class="card-body">
      <h4>${p.title}</h4>
      <p class="muted">${p.category}</p>
      <p>${p.description}</p>
      <strong>$${p.price.toFixed(2)}</strong>
      <div class="stack">
        <button class="btn" onclick="addToCart('${p.id}')">Add to Cart</button>
        <button class="btn ghost" onclick="toggleWishlist('${p.id}')">♡ Wishlist</button>
        <button class="btn ghost" onclick="makeOffer('${p.id}')">Make an Offer</button>
      </div>
    </div>
  </article>`;
}

function renderProducts() {
  const filtered = state.category === 'All' ? state.products : state.products.filter((p) => p.category === state.category);
  $('#products').innerHTML = filtered.map(productCard).join('');
}

async function refreshCatalog() {
  const { products, categories } = await api('/api/products');
  state.products = products;
  state.categories = categories;
  renderTabs();
  renderProducts();
}

function updateSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('comikingToken', token);
  localStorage.setItem('comikingUser', JSON.stringify(user));
  $('#authStatus').textContent = `Welcome ${user.name}. Premium features enabled.`;
  beep(820, 0.08);
  refreshUserData();
}

async function refreshUserData() {
  if (!state.token || !state.user) return;
  const [wishlist, profile, cart, orders] = await Promise.all([
    api('/api/wishlist'),
    api(`/api/profile/${state.user.id}`),
    api('/api/cart'),
    api('/api/orders')
  ]);

  $('#wishlist').innerHTML = wishlist.items.map((i) => `<div class="bubble">${i.title} — $${i.price.toFixed(2)}</div>`).join('') || '<p class="muted">No wishlist items yet.</p>';
  $('#profile').innerHTML = `<div class="bubble">${profile.name}</div>
    <div class="bubble">Followers: ${profile.followers}</div>
    <div class="bubble">Following: ${profile.following}</div>
    <button class="btn ghost" onclick="followSelfTest()">Follow/Unfollow self test account</button>`;

  $('#cart').innerHTML = cart.items.map((i) => `<div class="bubble">${i.product.title} × ${i.quantity} = $${i.lineTotal.toFixed(2)}</div>`).join('') + `<div class="bubble"><strong>Total: $${cart.total.toFixed(2)}</strong></div>`;

  $('#orders').innerHTML = orders.orders.map((o) => `<div class="bubble">Order ${o.id}<br/>Status: ${o.status}<br/><button class="btn ghost" onclick="trackOrder('${o.id}')">Track</button></div>`).join('') || '<p class="muted">No orders yet.</p>';
}

window.addToCart = async (id) => {
  try {
    await api(`/api/cart/${id}`, { method: 'POST', body: JSON.stringify({ quantity: 1 }) });
    beep(730);
    refreshUserData();
  } catch (e) {
    alert(e.message);
  }
};

window.toggleWishlist = async (id) => {
  try {
    await api(`/api/wishlist/${id}`, { method: 'POST' });
    beep(660);
    refreshUserData();
  } catch (e) {
    alert(e.message);
  }
};

window.makeOffer = async (id) => {
  const amount = Number(prompt('Enter your offer amount:'));
  if (!amount) return;
  try {
    const { offer } = await api(`/api/offers/${id}`, { method: 'POST', body: JSON.stringify({ amount }) });
    beep(520);
    alert(`Offer submitted: ${offer.decision}`);
  } catch (e) {
    alert(e.message);
  }
};

window.trackOrder = async (orderId) => {
  const { timeline } = await api(`/api/orders/${orderId}/track`);
  alert(timeline.map((t) => `${t.phase} — ${new Date(t.timestamp).toLocaleString()}`).join('\n'));
};

window.followSelfTest = async () => {
  const target = prompt('Enter profile ID to follow/unfollow:');
  if (!target) return;
  try {
    await api(`/api/profile/follow/${target}`, { method: 'POST' });
    refreshUserData();
  } catch (e) {
    alert(e.message);
  }
};

$('#signupForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  try {
    const data = await api('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    updateSession(data.token, data.user);
  } catch (err) {
    $('#authStatus').textContent = err.message;
  }
};

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    updateSession(data.token, data.user);
  } catch (err) {
    $('#authStatus').textContent = err.message;
  }
};

$('#checkoutForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  try {
    const { order } = await api('/api/checkout', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    beep(910, 0.12);
    alert(`Order ${order.id} placed!`);
    refreshUserData();
  } catch (err) {
    alert(err.message);
  }
};

$('#assistantForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const question = form.get('question');
  $('#assistantLog').innerHTML += `<div class="bubble user">You: ${question}</div>`;
  try {
    const { answer } = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ question }) });
    $('#assistantLog').innerHTML += `<div class="bubble">AI: ${answer}</div>`;
  } catch (err) {
    $('#assistantLog').innerHTML += `<div class="bubble">AI: ${err.message}</div>`;
  }
  e.currentTarget.reset();
};

$('#themeToggle').onclick = () => {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  beep(440);
};

$('#exploreBtn').onclick = () => {
  document.querySelector('#shelves').scrollIntoView({ behavior: 'smooth' });
  beep(540);
};

$('#demoLoginBtn').onclick = async () => {
  const random = Math.random().toString(36).slice(2, 6);
  const payload = { name: `Demo${random}`, email: `demo${random}@comiking.com`, password: 'demoPass123' };
  const data = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
  updateSession(data.token, data.user);
};

(async function init() {
  await refreshCatalog();
  if (state.token && state.user) {
    $('#authStatus').textContent = `Welcome back ${state.user.name}`;
    refreshUserData();
  }
})();
