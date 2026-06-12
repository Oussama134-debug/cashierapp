const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'cashier.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    icon TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pin TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    employee_name TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL,
    total REAL NOT NULL,
    payment TEXT DEFAULT 'cash',
    amount_paid REAL,
    change REAL DEFAULT 0,
    date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS delivery_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    employee_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    fulfilled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

try { db.exec('ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE employees ADD COLUMN role TEXT DEFAULT "cashier"'); } catch (_) {}

const categoryDefaults = { Coffee: 30, Tea: 25, Cold: 20, Food: 15, Drinks: 35 };

const count = db.prepare('SELECT COUNT(*) as cnt FROM products').get();
if (count.cnt === 0) {
  const insert = db.prepare('INSERT INTO products (name, price, category, stock) VALUES (?, ?, ?, ?)');
  const seed = [
    ['Espresso', 3.50, 'Coffee'],
    ['Latte', 4.50, 'Coffee'],
    ['Cappuccino', 4.00, 'Coffee'],
    ['Mocha', 5.00, 'Coffee'],
    ['Americano', 3.00, 'Coffee'],
    ['Green Tea', 2.50, 'Tea'],
    ['Black Tea', 2.50, 'Tea'],
    ['Chai Latte', 4.00, 'Tea'],
    ['Iced Coffee', 4.00, 'Cold'],
    ['Smoothie', 5.50, 'Cold'],
    ['Croissant', 3.00, 'Food'],
    ['Muffin', 2.50, 'Food'],
    ['Sandwich', 6.50, 'Food'],
    ['Cookie', 1.50, 'Food'],
    ['Mineral Water', 1.50, 'Drinks'],
    ['Orange Juice', 3.00, 'Drinks'],
  ];
  const tx = db.transaction((rows) => {
    for (const [name, price, category] of rows) {
      insert.run(name, price, category, categoryDefaults[category]);
    }
  });
  tx(seed);
} else {
  const update = db.prepare('UPDATE products SET stock = ? WHERE stock IS NULL OR stock = 0');
  const cats = db.prepare('SELECT DISTINCT category FROM products').all();
  for (const { category } of cats) {
    update.run(categoryDefaults[category] || 20);
  }
}

const empCount = db.prepare('SELECT COUNT(*) as cnt FROM employees').get();
if (empCount.cnt === 0) {
  const ins = db.prepare('INSERT INTO employees (name, pin, role) VALUES (?, ?, ?)');
  ins.run('Alice', '1111', 'manager');
  ins.run('Bob', '2222', 'cashier');
  ins.run('Charlie', '3333', 'cashier');
}

module.exports = db;
module.exports.categoryDefaults = categoryDefaults;
