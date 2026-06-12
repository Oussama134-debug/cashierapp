const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { categoryDefaults } = require('./db');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const ticketsDir = path.join(__dirname, 'tickets');
const refillDir = path.join(__dirname, 'refillRequests');
if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir, { recursive: true });
if (!fs.existsSync(refillDir)) fs.mkdirSync(refillDir, { recursive: true });

const carts = new Map();
const sessionEmployees = new Map();

function getCart(sessionId) {
  if (!carts.has(sessionId)) carts.set(sessionId, []);
  return carts.get(sessionId);
}

function requireSession(req, res) {
  const sid = req.headers['x-session-id'];
  if (!sid) { res.status(400).json({ error: 'Missing session' }); return null; }
  return sid;
}

function requireEmployee(req, res) {
  const sid = requireSession(req, res);
  if (!sid) return null;
  const emp = sessionEmployees.get(sid);
  if (!emp) { res.status(401).json({ error: 'Not logged in' }); return null; }
  return emp;
}

// --- Auth ---

app.post('/api/login', (req, res) => {
  const sid = req.headers['x-session-id'];
  if (!sid) return res.status(400).json({ error: 'Missing session' });
  const employee = db.prepare('SELECT id, name, role FROM employees WHERE pin = ?').get(req.body.pin);
  if (!employee) return res.status(401).json({ error: 'Invalid PIN' });
  sessionEmployees.set(sid, employee);
  res.json({ employee });
});

app.get('/api/me', (req, res) => {
  const emp = requireEmployee(req, res);
  if (!emp) return;
  res.json({ employee: emp });
});

// --- Products ---

app.get('/api/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY id').all());
});

app.get('/api/products/low-stock', (req, res) => {
  res.json(db.prepare('SELECT * FROM products WHERE stock <= 3 ORDER BY stock ASC').all());
});

// --- Cart ---

app.get('/api/cart', (req, res) => {
  const sid = requireSession(req, res);
  if (!sid) return;
  res.json(getCart(sid));
});

app.post('/api/cart/add', (req, res) => {
  const sid = requireSession(req, res);
  if (!sid) return;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.body.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.stock <= 0) return res.status(400).json({ error: 'Out of stock' });

  const cart = getCart(sid);
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1 });
  }
  res.json(cart);
});

app.post('/api/cart/remove', (req, res) => {
  const sid = requireSession(req, res);
  if (!sid) return;
  const cart = getCart(sid);
  const idx = cart.findIndex(item => item.id === req.body.id);
  if (idx !== -1) cart.splice(idx, 1);
  res.json(cart);
});

app.post('/api/cart/update', (req, res) => {
  const sid = requireSession(req, res);
  if (!sid) return;
  const cart = getCart(sid);
  const item = cart.find(i => i.id === req.body.id);
  if (!item) return res.status(404).json({ error: 'Item not in cart' });
  item.quantity += req.body.delta;
  if (item.quantity <= 0) {
    const idx = cart.indexOf(item);
    cart.splice(idx, 1);
  }
  res.json(cart);
});

// --- Checkout ---

app.post('/api/checkout', (req, res) => {
  const emp = requireEmployee(req, res);
  if (!emp) return;

  const { payment, amountPaid, customerName } = req.body;
  const sid = req.headers['x-session-id'];
  const cart = getCart(sid);

  if (cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  // Verify stock sufficiency
  for (const item of cart) {
    const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.id);
    if (!product || product.stock < item.quantity) {
      return res.status(400).json({ error: `Insufficient stock for ${item.name} (have ${product ? product.stock : 0}, need ${item.quantity})` });
    }
  }

  const items = cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }));
  const total = Math.round(items.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100;

  if (amountPaid != null && amountPaid < total) {
    return res.status(400).json({ error: 'Insufficient payment' });
  }

  const paid = amountPaid ?? total;
  const change = Math.round((paid - total) * 100) / 100;
  const now = new Date().toISOString();
  const customer = (customerName || '').trim() || 'Guest';

  const stmt = db.prepare(
    'INSERT INTO transactions (session_id, employee_name, customer_name, items, total, payment, amount_paid, change, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(sid, emp.name, customer, JSON.stringify(items), total, payment || 'cash', paid, change, now);

  // Decrement stock
  const decStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
  for (const item of items) {
    decStmt.run(item.quantity, item.id);
  }

  carts.delete(sid);

  const ticket = buildTicket(result.lastInsertRowid, emp.name, customer, items, total, paid, change, now);
  const fileName = `ticket_${String(result.lastInsertRowid).padStart(4, '0')}.txt`;
  fs.writeFileSync(path.join(ticketsDir, fileName), ticket, 'utf8');

  res.json({
    id: result.lastInsertRowid,
    employeeName: emp.name,
    customerName: customer,
    items,
    total,
    payment: payment || 'cash',
    amountPaid: paid,
    change,
    date: now,
  });
});

function buildTicket(id, employee, customer, items, total, paid, change, date) {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  const line = '='.repeat(40);
  const sep = '-'.repeat(40);
  const body = items.map(i =>
    `${String(i.quantity).padStart(2)}x ${i.name.padEnd(18)} $${(i.price * i.quantity).toFixed(2)}`
  ).join('\n');
  return `${line}\n          CASHIER RECEIPT\n${line}\nTicket #: ${String(id).padStart(4, '0')}\nEmployee: ${employee}\nCustomer: ${customer}\nDate:     ${dateStr}\n${sep}\n${body}\n${sep}\n${' '.repeat(24)}Total: $${total.toFixed(2)}\n${' '.repeat(24)}Paid:  $${paid.toFixed(2)}\n${' '.repeat(24)}Change: $${change.toFixed(2)}\n${line}\n            Thank You!\n${line}\n`;
}

// --- Stock Adjustments ---

app.post('/api/stock/adjust', (req, res) => {
  const emp = requireEmployee(req, res);
  if (!emp) return;
  if (emp.role !== 'manager') return res.status(403).json({ error: 'Manager only' });

  const { productId, quantity, reason } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const now = new Date().toISOString();
  db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(quantity, productId);
  db.prepare('INSERT INTO stock_adjustments (product_id, product_name, quantity_change, reason, employee_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(productId, product.name, quantity, reason, emp.name, now);

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.json(updated);
});

// --- Stock Reset (manager only) ---

app.post('/api/stock/reset', (req, res) => {
  const emp = requireEmployee(req, res);
  if (!emp) return;
  if (emp.role !== 'manager') return res.status(403).json({ error: 'Manager only' });

  const before = db.prepare('SELECT id, name, stock FROM products ORDER BY id').all();
  const now = new Date();
  const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

  const update = db.prepare('UPDATE products SET stock = ? WHERE id = ?');
  const products = db.prepare('SELECT * FROM products').all();
  const tx = db.transaction(() => {
    for (const p of products) {
      update.run(categoryDefaults[p.category] || 20, p.id);
    }
  });
  tx();

  const snapshot = before.map(p => `${p.name}:${p.stock}`).join(', ');
  const logLine = `[${dateStr}] Reset by ${emp.name} — Before: {${snapshot}}\n`;
  fs.appendFileSync(path.join(refillDir, 'reset_log.txt'), logLine, 'utf8');

  res.json({ message: 'Stocks reset to defaults', products: db.prepare('SELECT * FROM products ORDER BY id').all() });
});

// --- Delivery / Refill Requests ---

app.post('/api/delivery/request', (req, res) => {
  const emp = requireEmployee(req, res);
  if (!emp) return;
  if (emp.role !== 'manager') return res.status(403).json({ error: 'Manager only' });

  const { productId, quantity } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const now = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();

  const result = db.prepare(
    'INSERT INTO delivery_orders (product_id, product_name, quantity, employee_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(productId, product.name, quantity, emp.name, 'pending', now);

  // Save refill request file
  const line = '='.repeat(40);
  const content = `${line}\n          REFILL REQUEST\n${line}\nRequest #: ${String(result.lastInsertRowid).padStart(4, '0')}\nProduct:   ${product.name}\nQuantity:  ${quantity}\nEmployee:  ${emp.name}\nStatus:    pending\nDate:      ${dateStr}\n${line}\n`;
  const fileName = `request_${String(result.lastInsertRowid).padStart(4, '0')}.txt`;
  fs.writeFileSync(path.join(refillDir, fileName), content, 'utf8');

  res.json({ id: result.lastInsertRowid, productName: product.name, quantity, employeeName: emp.name, status: 'pending' });
});

app.get('/api/delivery/requests', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM delivery_orders WHERE status = ? ORDER BY id DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM delivery_orders ORDER BY id DESC').all();
  }
  res.json(rows);
});

app.post('/api/delivery/fulfill/:id', (req, res) => {
  const emp = requireEmployee(req, res);
  if (!emp) return;

  const order = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Request not found' });
  if (order.status === 'delivered') return res.status(400).json({ error: 'Already delivered' });

  const now = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();

  db.prepare('UPDATE delivery_orders SET status = ?, fulfilled_at = ? WHERE id = ?').run('delivered', now, order.id);
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(order.quantity, order.product_id);

  // Update the refill request file
  const filePath = path.join(refillDir, `request_${String(order.id).padStart(4, '0')}.txt`);
  if (fs.existsSync(filePath)) {
    const line = '='.repeat(40);
    const content = `${line}\n          REFILL REQUEST\n${line}\nRequest #: ${String(order.id).padStart(4, '0')}\nProduct:   ${order.product_name}\nQuantity:  ${order.quantity}\nEmployee:  ${order.employee_name}\nStatus:    delivered\nDate:      ${dateStr}\nFulfilled: ${dateStr}\n${line}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  res.json({ message: 'Delivery fulfilled', productId: order.product_id, quantity: order.quantity });
});

// --- Transactions ---

app.get('/api/transactions', (req, res) => {
  const txns = db.prepare('SELECT * FROM transactions ORDER BY id DESC').all();
  res.json(txns.map(t => ({ ...t, items: JSON.parse(t.items) })));
});

app.listen(PORT, () => {
  console.log(`Cashier app running at http://localhost:${PORT}`);
});
