import type { Client, InValue } from "@libsql/client";
import fs from "node:fs";
import { cache } from "react";

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
  CREATE TABLE IF NOT EXISTS vehicles(
    id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id),
    kind TEXT NOT NULL DEFAULT 'Xe máy', plate TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS activity(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL, room_id INTEGER, kind TEXT NOT NULL,
    text TEXT NOT NULL, ts TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_ts ON activity(ts);
  CREATE TABLE IF NOT EXISTS issues(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL, room_id INTEGER, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open', source TEXT NOT NULL DEFAULT 'owner', cost INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL, resolved TEXT
  );
  CREATE TABLE IF NOT EXISTS pinned_expenses(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'phat_sinh',
    qty REAL NOT NULL DEFAULT 1, unit INTEGER NOT NULL DEFAULT 0, from_month TEXT NOT NULL, last_month TEXT NOT NULL,
    UNIQUE(house_id, name)
  );
  CREATE TABLE IF NOT EXISTS ledger_init(
    house_id INTEGER NOT NULL, month TEXT NOT NULL, PRIMARY KEY(house_id, month)
  );
  CREATE TABLE IF NOT EXISTS residents(
    id INTEGER PRIMARY KEY, house_id INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
    room_code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', cccd TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT '', dob TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    job TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', plate TEXT NOT NULL DEFAULT '',
    vehicle TEXT NOT NULL DEFAULT '', emergency TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS residents_house ON residents(house_id);
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
  invoice_note: "", // lời nhắn cuối hóa đơn gửi khách (để trống = dùng lời nhắn mặc định)
  partners: "", // chia lãi, VD: "Tài:50, Lộc:50" (để trống = không chia)
};

/**
 * Phiên bản cấu trúc database. Khi thêm bảng/cột mới trong init() thì TĂNG số này, để lần chạy đầu tiên nâng cấp một lần.
 * Các lần sau chỉ tốn 1 truy vấn kiểm tra (thay vì ~25 truy vấn mỗi lần khởi động máy chủ).
 */
const SCHEMA_VERSION = "15";

async function init() {
  const c = await getClient();
  try {
    const v = await c.execute("SELECT value FROM settings WHERE key='schema_v'");
    if (v.rows.length && String(v.rows[0].value) === SCHEMA_VERSION) return;
  } catch { /* chưa có bảng: database mới, chạy khởi tạo đầy đủ */ }
  await initFull(c);
  await c.execute({ sql: "INSERT INTO settings(key,value) VALUES ('schema_v',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [SCHEMA_VERSION] });
}

async function initFull(c: Client) {
  await c.executeMultiple(SCHEMA);

  // Nâng cấp database cũ: thêm cột "locked" (hóa đơn nhập từ sheet, không tự tính lại)
  const cols = await c.execute("SELECT name FROM pragma_table_info('invoices')");
  if (!cols.rows.some((r) => r.name === "locked")) {
    await c.execute("ALTER TABLE invoices ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  }
  // Phòng: tầng/khu tự đặt (VD "Tầng trệt", "Mặt bằng kinh doanh") và loại phòng
  const rcols2 = await c.execute("SELECT name FROM pragma_table_info('rooms')");
  for (const [col, ddl] of [["elec_start", "REAL NOT NULL DEFAULT 0"], ["water_start", "REAL NOT NULL DEFAULT 0"]] as const) {
    if (!rcols2.rows.some((r) => r.name === col)) await c.execute(`ALTER TABLE rooms ADD COLUMN ${col} ${ddl}`);
  }
  // Dịch vụ riêng của một phòng (room_id) hoặc chung cả nhà (room_id rỗng)
  const scols = await c.execute("SELECT name FROM pragma_table_info('services')");
  if (!scols.rows.some((r) => r.name === "room_id")) await c.execute("ALTER TABLE services ADD COLUMN room_id INTEGER");
  for (const col of ["floor_label", "kind"]) {
    if (!rcols2.rows.some((r) => r.name === col)) await c.execute(`ALTER TABLE rooms ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  }
  // Sổ thu chi: cột meta lưu thêm chi tiết (số lượng, đơn giá, phòng mới...)
  const lcols = await c.execute("SELECT name FROM pragma_table_info('ledger')");
  if (!lcols.rows.some((r) => r.name === "meta")) await c.execute("ALTER TABLE ledger ADD COLUMN meta TEXT NOT NULL DEFAULT ''");
  // Ghi chú cho từng khoản chi hằng tháng đã ghim
  const pcols = await c.execute("SELECT name FROM pragma_table_info('pinned_expenses')");
  if (!pcols.rows.some((r) => r.name === "note")) await c.execute("ALTER TABLE pinned_expenses ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  // Hợp đồng và tạm trú của khách thuê
  const tcols = await c.execute("SELECT name FROM pragma_table_info('tenants')");
  for (const [col, ddl] of [["contract_end", "TEXT DEFAULT ''"], ["residence_done", "INTEGER NOT NULL DEFAULT 0"]] as const) {
    if (!tcols.rows.some((r) => r.name === col)) await c.execute(`ALTER TABLE tenants ADD COLUMN ${col} ${ddl}`);
  }
  // Trạng thái đặt tay trên danh sách hóa đơn: '' = tự tính, 'unpaid' = chưa thu, 'overdue' = quá hạn
  if (!cols.rows.some((r) => r.name === "state")) await c.execute("ALTER TABLE invoices ADD COLUMN state TEXT NOT NULL DEFAULT ''");
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
const TRACE = !!process.env.DB_TRACE;
const trace = (what: string) => { if (TRACE) console.log(`[db] ${what.replace(/\s+/g, " ").slice(0, 90)}`); };
export async function all<T = Record<string, unknown>>(sql: string, ...p: P[]): Promise<T[]> {
  const c = await ready();
  trace(sql);
  const r = await c.execute({ sql, args: p });
  return r.rows.map((row) => ({ ...row })) as unknown as T[];
}
export async function one<T = Record<string, unknown>>(sql: string, ...p: P[]): Promise<T | undefined> {
  return (await all<T>(sql, ...p))[0];
}
export async function run(sql: string, ...p: P[]) {
  const c = await ready();
  trace(sql);
  const r = await c.execute({ sql, args: p });
  return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected };
}
/** Chạy nhiều lệnh trong 1 giao dịch (hoặc cả nhóm thành công, hoặc không gì cả). */
export async function batch(stmts: { sql: string; args?: P[] }[]) {
  const c = await ready();
  trace(`BATCH x${stmts.length}`);
  await c.batch(stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })), "write");
}
/** Như batch nhưng trả về kết quả từng lệnh (dòng dữ liệu), để vừa ghi vừa đọc trong 1 lượt gọi mạng. */
export async function batchRows(stmts: { sql: string; args?: P[] }[]): Promise<Record<string, unknown>[][]> {
  const c = await ready();
  trace(`BATCH x${stmts.length}`);
  const rs = await c.batch(stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })), "write");
  return rs.map((r) => r.rows.map((row) => ({ ...row })));
}
/**
 * Đọc NHIỀU truy vấn trong 1 lượt gọi mạng. Database ở xa nên mỗi lượt gọi tốn vài chục đến vài trăm mili giây:
 * gom lại thay vì gọi lần lượt từng cái là cách làm web nhanh nhất.
 */
export async function readAll(queries: { sql: string; args?: P[] }[]): Promise<Record<string, unknown>[][]> {
  const c = await ready();
  trace(`READ x${queries.length}`);
  const rs = await c.batch(queries.map((q) => ({ sql: q.sql, args: q.args ?? [] })), "read");
  return rs.map((r) => r.rows.map((row) => ({ ...row })));
}
export type House = { id: number; name: string; address: string };
// cache(): trong cùng một lần hiển thị trang, nhiều nơi gọi cũng chỉ truy vấn 1 lần
export const listHouses = cache(async (): Promise<House[]> => all<House>("SELECT id, name, address FROM houses ORDER BY sort, id"));
/** Ghép cài đặt của một nhà từ các dòng đã đọc (dùng chung cho getSettings và loadMonth). */
export function mergeSettings(house: House | undefined, rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = { ...HOUSE_DEFAULTS };
  out.house_name = house?.name ?? "Nhà trọ";
  out.house_address = house?.address ?? "";
  for (const r of rows) out[r.key] = r.value;
  return out;
}
/** Cài đặt của MỘT nhà (đã gồm giá trị mặc định + tên, địa chỉ nhà). */
export async function getSettings(houseId: number): Promise<Record<string, string>> {
  const [h, kv] = await readAll([
    { sql: "SELECT id, name, address FROM houses WHERE id=?", args: [houseId] },
    { sql: "SELECT key,value FROM house_settings WHERE house_id=?", args: [houseId] },
  ]);
  return mergeSettings(h[0] as House | undefined, kv as { key: string; value: string }[]);
}
