import type { Client, InValue } from "@libsql/client";
import fs from "node:fs";

/**
 * Database: libSQL (SQLite). Chạy trên máy = file data/nhatro.db.
 * Khi đưa lên mạng: đặt TURSO_DATABASE_URL và TURSO_AUTH_TOKEN (Turso, gói miễn phí).
 */
const g = globalThis as unknown as { __nhatro_client?: Client; __nhatro_ready?: Promise<void> };

async function getClient(): Promise<Client> {
  if (!g.__nhatro_client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (url) {
      // Chạy trên mạng: dùng bản web (không cần thư viện native)
      const { createClient } = await import("@libsql/client/web");
      g.__nhatro_client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    } else {
      const { createClient } = await import("@libsql/client");
      fs.mkdirSync("data", { recursive: true });
      g.__nhatro_client = createClient({ url: "file:data/nhatro.db" });
    }
  }
  return g.__nhatro_client;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rooms(
    id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, rent INTEGER NOT NULL DEFAULT 0,
    due_day INTEGER NOT NULL DEFAULT 15, note TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS tenants(
    id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id),
    name TEXT NOT NULL, phone TEXT DEFAULT '', people INTEGER NOT NULL DEFAULT 1,
    move_in TEXT DEFAULT '', deposit INTEGER DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, move_out TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS services(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'room',
    price INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS readings(
    room_id INTEGER NOT NULL REFERENCES rooms(id), month TEXT NOT NULL,
    elec_old REAL NOT NULL DEFAULT 0, elec_new REAL NOT NULL DEFAULT 0,
    water_old REAL NOT NULL DEFAULT 0, water_new REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(room_id, month)
  );
  CREATE TABLE IF NOT EXISTS extras(
    id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id),
    month TEXT NOT NULL, name TEXT NOT NULL, amount INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invoices(
    id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id), month TEXT NOT NULL,
    tenant_name TEXT DEFAULT '', people INTEGER DEFAULT 1, prev_debt INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0, due_date TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
    UNIQUE(room_id, month)
  );
  CREATE TABLE IF NOT EXISTS invoice_lines(
    id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    label TEXT NOT NULL, detail TEXT DEFAULT '', amount INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments(
    id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, method TEXT DEFAULT 'bank', paid_at TEXT NOT NULL, note TEXT DEFAULT ''
  );
`;

async function init() {
  const c = await getClient();
  await c.executeMultiple(SCHEMA);
  const n = Number((await c.execute("SELECT COUNT(*) c FROM rooms")).rows[0].c);
  if (n > 0) return;
  // Giá thuê lấy từ Google Sheet tháng 8/2026 (theo thứ tự phòng).
  // Số người, hạn đóng, tên khách là DỮ LIỆU MẪU — sửa trong trang Phòng.
  const rooms: [string, number, number, number, string][] = [
    ["201", 2800000, 15, 2, "Khách mẫu"],
    ["202", 3200000, 15, 2, "Khách mẫu"],
    ["203", 3800000, 20, 3, "Khách mẫu"],
    ["301", 3200000, 20, 2, "Khách mới"],
    ["302", 3500000, 25, 2, "Khách mẫu"],
    ["303", 4000000, 30, 2, "Khách mẫu"],
  ];
  for (const [code, rent, due, people, name] of rooms) {
    const r = await c.execute({ sql: "INSERT INTO rooms(code, rent, due_day) VALUES (?,?,?)", args: [code, rent, due] });
    await c.execute({
      sql: "INSERT INTO tenants(room_id, name, people, move_in) VALUES (?,?,?,?)",
      args: [Number(r.lastInsertRowid), `${name} P.${code}`, people, "2026-01-01"],
    });
  }
  const settings: Record<string, string> = {
    house_name: "Nhà trọ Dvu T7",
    elec_price: "3500", // TẠM — sửa trong Cài đặt
    water_mode: "meter", // meter = theo m³, person = theo đầu người
    water_price: "25000", // TẠM
    bank_code: "TCB",
    bank_account: "",
    bank_holder: "VU DINH LOC",
  };
  for (const [k, v] of Object.entries(settings)) {
    await c.execute({ sql: "INSERT INTO settings(key,value) VALUES (?,?)", args: [k, v] });
  }
  // Dịch vụ TẠM — sửa trong Cài đặt
  const svc: [string, string, number][] = [["Wifi", "room", 100000], ["Vệ sinh, rác", "person", 20000], ["Máy giặt", "room", 108000]];
  for (const [name, type, price] of svc) {
    await c.execute({ sql: "INSERT INTO services(name,type,price) VALUES (?,?,?)", args: [name, type, price] });
  }
}

async function ready(): Promise<Client> {
  g.__nhatro_ready ??= init();
  await g.__nhatro_ready;
  return getClient();
}

type P = InValue;
export async function all<T = Record<string, unknown>>(sql: string, ...p: P[]): Promise<T[]> {
  const c = await ready();
  const r = await c.execute({ sql, args: p });
  return r.rows.map((row) => ({ ...row })) as unknown as T[];
}
export async function one<T = Record<string, unknown>>(sql: string, ...p: P[]): Promise<T | undefined> {
  return (await all<T>(sql, ...p))[0];
}
export async function run(sql: string, ...p: P[]) {
  const c = await ready();
  const r = await c.execute({ sql, args: p });
  return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected };
}
/** Chạy nhiều lệnh trong 1 giao dịch (hoặc cả nhóm thành công, hoặc không gì cả). */
export async function batch(stmts: { sql: string; args?: P[] }[]) {
  const c = await ready();
  await c.batch(stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })), "write");
}
export async function getSettings(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await all<{ key: string; value: string }>("SELECT key,value FROM settings")) out[r.key] = r.value;
  return out;
}
