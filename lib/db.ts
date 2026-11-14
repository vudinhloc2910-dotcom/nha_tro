import type { Client, InValue } from "@libsql/client";
import fs from "node:fs";

/**
 * Database: libSQL (SQLite). Chạy trên máy = file data/nhatro.db.
 * Khi đưa lên mạng: đặt TURSO_DATABASE_URL và TURSO_AUTH_TOKEN (Turso, gói miễn phí).
 */
const g = globalThis as unknown as { __nhatro_client?: Client; __nhatro_ready?: Promise<void> };

export async function getClient(): Promise<Client> {
  if (!g.__nhatro_client) {
    const rawUrl = process.env.TURSO_DATABASE_URL?.trim();
    if (rawUrl) {
      // Chạy trên mạng: dùng bản web (không cần thư viện native).
      // Đổi libsql:// thành https:// để đi qua HTTP, chạy được trên mọi phiên bản Node (không cần WebSocket).
      const url = rawUrl.replace(/^libsql:\/\//, "https://");
      const { createClient } = await import("@libsql/client/web");
      g.__nhatro_client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() });
    } else {
      const { createClient } = await import("@libsql/client");
      fs.mkdirSync("data", { recursive: true });
      g.__nhatro_client = createClient({ url: "file:data/nhatro.db" });
    }
  }
  return g.__nhatro_client;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS houses(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS house_settings(
    house_id INTEGER NOT NULL REFERENCES houses(id), key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(house_id, key)
  );
  CREATE TABLE IF NOT EXISTS rooms(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL DEFAULT 1 REFERENCES houses(id),
    code TEXT NOT NULL, rent INTEGER NOT NULL DEFAULT 0,
    due_day INTEGER NOT NULL DEFAULT 15, note TEXT DEFAULT '',
    UNIQUE(house_id, code)
  );
  CREATE TABLE IF NOT EXISTS tenants(
    id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id),
    name TEXT NOT NULL, phone TEXT DEFAULT '', people INTEGER NOT NULL DEFAULT 1,
    move_in TEXT DEFAULT '', deposit INTEGER DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, move_out TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS services(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'room',
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
    locked INTEGER NOT NULL DEFAULT 0,
    UNIQUE(room_id, month)
  );
  CREATE TABLE IF NOT EXISTS invoice_lines(
    id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    label TEXT NOT NULL, detail TEXT DEFAULT '', amount INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ledger(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL REFERENCES houses(id), month TEXT NOT NULL,
    kind TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  );
  CREATE INDEX IF NOT EXISTS ledger_house_month ON ledger(house_id, month);
  CREATE TABLE IF NOT EXISTS room_prefs(
    room_id INTEGER NOT NULL REFERENCES rooms(id), key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(room_id, key)
  );
  CREATE TABLE IF NOT EXISTS room_month(
    room_id INTEGER NOT NULL REFERENCES rooms(id), month TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(room_id, month, key)
  );
  CREATE TABLE IF NOT EXISTS payments(
    id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, method TEXT DEFAULT 'bank', paid_at TEXT NOT NULL, note TEXT DEFAULT ''
  );
`;

/** Danh sách nhà (địa chỉ do chủ trọ cung cấp). id cố định để chạy lại không bị nhân đôi. */
const HOUSES: [number, string, string][] = [
  [1, "272 Mậu Lương", "Tổ dân phố 11, Mậu Lương, Hà Đông, Hà Nội"],
  [2, "Lô 3,4,5 Liền kề 9", "Lô 3,4,5 Liền kề 9, khu đất đấu giá Mậu Lương, Kiến Hưng, Hà Đông, Hà Nội"],
  [3, "12 ngõ 167 Quang Trung", "Số nhà 12 ngõ 167 Quang Trung, Hà Đông, Hà Nội"],
  [4, "No33 Hà Trì", "No33, liền kề 01 khu dịch vụ Hà Trì, Hà Cầu, Hà Đông, Hà Nội"],
  [5, "4 ngõ 116/51 Miếu Đầm", "Số 4, ngõ 116/51 Miếu Đầm, Nam Từ Liêm, Hà Nội"],
  [6, "20 ngách 15/21 ngõ 230 Mễ Trì Thượng", "Số 20, ngách 15/21 ngõ 230 Mễ Trì Thượng, Nam Từ Liêm, Hà Nội"],
  [7, "8A Giải Phóng", "Số nhà 8A, ngách 14 ngõ 192 Giải Phóng, Thanh Liệt, Hà Nội"],
  [8, "Tân Khai (ngõ 150/82)", "Ngõ 150/82 Tân Khai"],
];

/** Giá trị mặc định của một nhà mới (sửa trong Cài đặt). */
export const HOUSE_DEFAULTS: Record<string, string> = {
  house_phone: "",
  elec_price: "3500",
  water_mode: "meter", // meter = theo m³, person = theo đầu người
  water_price: "25000",
  bank_code: "TCB",
  bank_account: "",
  bank_holder: "VU DINH LOC",
  rent_cost_monthly: "0", // tiền thuê nhà trả chủ, quy ra mỗi tháng (dùng trong báo cáo lãi lỗ)
  manager_salary: "0", // lương quản lý mỗi tháng (0 = nhà không có)
  partners: "", // chia lãi, VD: "Tài:50, Lộc:50" (để trống = không chia)
};

async function init() {
  const c = await getClient();
  await c.executeMultiple(SCHEMA);

  // Nâng cấp database cũ: thêm cột "locked" (hóa đơn nhập từ sheet, không tự tính lại)
  const cols = await c.execute("SELECT name FROM pragma_table_info('invoices')");
  if (!cols.rows.some((r) => r.name === "locked")) {
    await c.execute("ALTER TABLE invoices ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  }
  // Kỳ hạn thuê của hóa đơn (ngày bắt đầu; ngày kết thúc chính là hạn đóng due_date)
  if (!cols.rows.some((r) => r.name === "period_start")) {
    await c.execute("ALTER TABLE invoices ADD COLUMN period_start TEXT");
  }

  // Nhiều nhà: tạo danh sách nhà (chạy lại không nhân đôi nhờ id cố định)
  await c.batch(
    HOUSES.map(([id, name, address], i) => ({
      sql: "INSERT OR IGNORE INTO houses(id,name,address,sort) VALUES (?,?,?,?)",
      args: [id, name, address, i + 1],
    })),
    "write"
  );

  // Nâng cấp database cũ (1 nhà): gắn toàn bộ phòng, dịch vụ, cài đặt hiện có vào nhà số 1
  const roomCols = await c.execute("SELECT name FROM pragma_table_info('rooms')");
  if (!roomCols.rows.some((r) => r.name === "house_id")) {
    // migrate() = chạy một giao dịch với khóa ngoại TẠM TẮT (cách chuẩn của SQLite để dựng lại bảng)
    await c.migrate([
      {
        sql: `CREATE TABLE rooms_new(
          id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL DEFAULT 1 REFERENCES houses(id),
          code TEXT NOT NULL, rent INTEGER NOT NULL DEFAULT 0,
          due_day INTEGER NOT NULL DEFAULT 15, note TEXT DEFAULT '', UNIQUE(house_id, code))`,
        args: [],
      },
      { sql: "INSERT INTO rooms_new(id,house_id,code,rent,due_day,note) SELECT id,1,code,rent,due_day,note FROM rooms", args: [] },
      { sql: "DROP TABLE rooms", args: [] },
      { sql: "ALTER TABLE rooms_new RENAME TO rooms", args: [] },
    ]);
  }
  const svcCols = await c.execute("SELECT name FROM pragma_table_info('services')");
  if (!svcCols.rows.some((r) => r.name === "house_id")) {
    await c.execute("ALTER TABLE services ADD COLUMN house_id INTEGER NOT NULL DEFAULT 1");
  }
  // Chuyển cài đặt chung cũ sang nhà số 1 (chỉ làm một lần: khi nhà 1 chưa có cài đặt riêng)
  const hs = Number((await c.execute("SELECT COUNT(*) c FROM house_settings WHERE house_id=1")).rows[0].c);
  if (hs === 0) {
    const old = await c.execute("SELECT key,value FROM settings");
    const m: Record<string, string> = {};
    for (const r of old.rows) m[String(r.key)] = String(r.value);
    const stmts: { sql: string; args: InValue[] }[] = [];
    for (const k of Object.keys(HOUSE_DEFAULTS)) {
      stmts.push({ sql: "INSERT OR IGNORE INTO house_settings(house_id,key,value) VALUES (1,?,?)", args: [k, m[k] ?? HOUSE_DEFAULTS[k]] });
    }
    await c.batch(stmts, "write");
  }

  const n = Number((await c.execute("SELECT COUNT(*) c FROM rooms")).rows[0].c);
  if (n > 0) return;
  // Database trống hoàn toàn: tạo vài phòng MẪU cho nhà số 1 (sửa trong trang Phòng).
  const rooms: [string, number, number, number, string][] = [
    ["201", 2800000, 15, 2, "Khách mẫu"],
    ["202", 3200000, 15, 2, "Khách mẫu"],
    ["203", 3800000, 20, 3, "Khách mẫu"],
    ["301", 3200000, 20, 2, "Khách mới"],
    ["302", 3500000, 25, 2, "Khách mẫu"],
    ["303", 4000000, 30, 2, "Khách mẫu"],
  ];
  // Gộp toàn bộ dữ liệu mẫu vào MỘT giao dịch: hoặc đủ hết hoặc không gì cả (tránh nửa chừng khi mạng chậm).
  const stmts: { sql: string; args: InValue[] }[] = [];
  for (const [code, rent, due, people, name] of rooms) {
    stmts.push({ sql: "INSERT INTO rooms(house_id, code, rent, due_day) VALUES (1,?,?,?)", args: [code, rent, due] });
    stmts.push({
      sql: "INSERT INTO tenants(room_id, name, people, move_in) VALUES ((SELECT id FROM rooms WHERE house_id=1 AND code=?),?,?,?)",
      args: [code, `${name} P.${code}`, people, "2026-01-01"],
    });
  }
  // Dịch vụ TẠM — sửa trong Cài đặt
  const svc: [string, string, number][] = [["Wifi", "room", 100000], ["Vệ sinh, rác", "person", 20000], ["Máy giặt", "room", 108000]];
  for (const [name, type, price] of svc) {
    stmts.push({ sql: "INSERT INTO services(house_id,name,type,price) VALUES (1,?,?,?)", args: [name, type, price] });
  }
  await c.batch(stmts, "write");
}

async function ready(): Promise<Client> {
  if (!g.__nhatro_ready) {
    // Nếu khởi tạo lỗi thì xóa kết quả lỗi để lần sau thử lại (không kẹt lỗi vĩnh viễn)
    g.__nhatro_ready = init().catch((e) => {
      g.__nhatro_ready = undefined;
      throw e;
    });
  }
  await g.__nhatro_ready;
  return getClient();
}

/** Dùng cho trang kiểm tra /api/health */
export async function pingDb(): Promise<void> {
  const c = await ready();
  await c.execute("SELECT 1");
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
export type House = { id: number; name: string; address: string };
export async function listHouses(): Promise<House[]> {
  return all<House>("SELECT id, name, address FROM houses ORDER BY sort, id");
}
/** Cài đặt của MỘT nhà (đã gồm giá trị mặc định + tên, địa chỉ nhà). */
export async function getSettings(houseId: number): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...HOUSE_DEFAULTS };
  const h = await one<House>("SELECT id, name, address FROM houses WHERE id=?", houseId);
  out.house_name = h?.name ?? "Nhà trọ";
  out.house_address = h?.address ?? "";
  for (const r of await all<{ key: string; value: string }>("SELECT key,value FROM house_settings WHERE house_id=?", houseId)) out[r.key] = r.value;
  return out;
}
