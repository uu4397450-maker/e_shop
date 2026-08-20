import supabase from "./supabaseClient";

const useSupabase = process.env.USE_SUPABASE === "true";

let db = null;

if (!useSupabase) {
  try {
    const Database = require("better-sqlite3");
    db = new Database("auth.db");

    // ---------------- USERS TABLE ----------------
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        shop_name TEXT
      )
    `).run();

    // Add shop_name column if it doesn't exist (for existing databases)
    try {
      db.prepare("ALTER TABLE users ADD COLUMN shop_name TEXT").run();
    } catch (e) {
      // Column already exists, ignore error
    }

    // ---------------- PRODUCTS TABLE ----------------
    db.prepare(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL,
        stock INTEGER,
        status TEXT,
        barcode TEXT,
        image TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // ---------------- CUSTOMERS TABLE ----------------
    db.prepare(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT
      )
    `).run();

    // ---------------- ORDERS TABLE ----------------
    db.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        total_amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        debt_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `).run();

    // ---------------- ORDER ITEMS TABLE ----------------
    db.prepare(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        item_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        total_price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `).run();

    console.log("USE_SUPABASE=false — SQLite database is active.");
  } catch (error) {
    console.warn("better-sqlite3 is unavailable in this environment. Set USE_SUPABASE=true for Vercel deployment.", error?.message || error);
    db = null;
  }
} else {
  console.log("USE_SUPABASE=true — Supabase is active, SQLite fallback is disabled.");
}

export { supabase, useSupabase, db };
export default db;


