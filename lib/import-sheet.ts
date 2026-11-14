import crypto from "node:crypto";
import { all, batch } from "./db";
import { vnd } from "./format";

export type ImportRoom = {
  room: string; elec_old: number; elec_new: number; elec_amount: number;
  water_old: number; water_new: number; water_amount: number; people: number;
  service: number; washer: number; wifi: number; rent: number; adjust: number; total: number;
  period: string; due: string | null; paid: number | null;
};
export type LedgerItem = { kind: "thu" | "chi"; category: string; name: string; amount: number };
export type ImportMonth = { month: string; rooms: ImportRoom[]; ledger: LedgerItem[]; sheet_thu: number | null; sheet_chi: number | null };
export type ImportSettings = {
  elec_price?: number; water_mode?: "meter" | "person"; water_price?: number;
  rent_cost_monthly?: number; manager_salary?: number; partners?: string; services?: [string, "room" | "person", number][];
};
export type ImportData = {
  house: string | null;
  bank: { code: string; account: string; holder: string } | null;
  settings: ImportSettings | null;
  months: ImportMonth[];
};
export type ImportResult = { summary: string; notes: string[]; houseName: string };

const NUM_FIELDS = [
  "elec_old", "elec_new", "elec_amount", "water_old", "water_new", "water_amount", "people",
  "service", "washer", "wifi", "rent", "adjust", "total",
] as const;
const CATEGORIES = new Set(["dien", "nuoc", "mang", "dich_vu", "tien_phong", "phat_sinh", "luong", "dau_tu", "phong_moi"]);

const finite = (v: unknown, what: string) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || Math.abs(n) > 1e11) throw new Error(`Số "${what}" không hợp lệ.`);
  return n;
};

/** Kiểm tra file JSON người dùng tải lên: sai cấu trúc thì báo lỗi rõ ràng. */
export function parseImport(raw: unknown): ImportData {
  const top = raw as Record<string, unknown>;
  const months = top?.months;
  if (!Array.isArray(months) || months.length === 0 || months.length > 60) throw new Error("File không đúng định dạng (thiếu danh sách tháng).");
  const out: ImportData = { house: null, bank: null, settings: null, months: [] };
  if (typeof top.house === "string" && top.house.length < 100) out.house = top.house;
  const b = top.bank as Record<string, unknown> | null | undefined;
  if (b && typeof b === "object") {
    const account = String(b.account ?? "").replace(/\D/g, "");
    if (account && account.length <= 20) out.bank = { code: String(b.code ?? "").slice(0, 10).toUpperCase(), account, holder: String(b.holder ?? "").slice(0, 60).toUpperCase() };
  }
  const st = top.settings as Record<string, unknown> | null | undefined;
  if (st && typeof st === "object") {
    const s: ImportSettings = {};
    if (st.elec_price != null) s.elec_price = Math.max(0, finite(st.elec_price, "elec_price"));
    if (st.water_price != null) s.water_price = Math.max(0, finite(st.water_price, "water_price"));
    if (st.water_mode === "meter" || st.water_mode === "person") s.water_mode = st.water_mode;
    if (st.rent_cost_monthly != null) s.rent_cost_monthly = Math.max(0, finite(st.rent_cost_monthly, "rent_cost_monthly"));
    if (st.manager_salary != null) s.manager_salary = Math.max(0, finite(st.manager_salary, "manager_salary"));
    if (typeof st.partners === "string") s.partners = st.partners.slice(0, 100);
    if (Array.isArray(st.services)) {
      s.services = (st.services as unknown[][]).slice(0, 20).map((x) => [String(x[0] ?? "").slice(0, 60), x[1] === "person" ? "person" : "room", Math.max(0, finite(x[2], "service"))] as [string, "room" | "person", number]).filter((x) => x[0]);
    }
    out.settings = s;
  }
  for (const m of months) {
    const month = String((m as { month?: unknown })?.month ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Tháng "${month}" không hợp lệ.`);
    const rooms = (m as { rooms?: unknown }).rooms;
    if (!Array.isArray(rooms) || rooms.length === 0 || rooms.length > 100) throw new Error(`Tháng ${month}: thiếu danh sách phòng.`);
    const list: ImportRoom[] = [];
    for (const r of rooms as Record<string, unknown>[]) {
      const room = String(r.room ?? "").trim();
      if (!room || room.length > 20) throw new Error(`Tháng ${month}: có phòng không hợp lệ.`);
      const o = { room, period: String(r.period ?? "").slice(0, 40), due: null as string | null, paid: null as number | null } as ImportRoom;
      for (const k of NUM_FIELDS) (o as unknown as Record<string, number>)[k] = finite(r[k], `${month} phòng ${room} ${k}`);
      o.due = typeof r.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null;
      o.paid = r.paid == null ? null : Math.max(0, finite(r.paid, `${month} phòng ${room} paid`));
      list.push(o);
    }
    const ledger: LedgerItem[] = [];
    const lg = (m as { ledger?: unknown }).ledger;
    if (Array.isArray(lg)) {
      for (const x of lg.slice(0, 200) as Record<string, unknown>[]) {
        const category = String(x.category ?? "");
        const amount = Math.round(finite(x.amount, `${month} khoản ${category}`));
        if (!CATEGORIES.has(category) || !amount) continue;
        ledger.push({ kind: x.kind === "thu" ? "thu" : "chi", category, name: String(x.name ?? "").slice(0, 120), amount });
      }
    }
    const sh = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    out.months.push({ month, rooms: list, ledger, sheet_thu: sh((m as Record<string, unknown>).sheet_thu), sheet_chi: sh((m as Record<string, unknown>).sheet_chi) });
  }
  out.months.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

type Arg = string | number | null;
type Stmt = { sql: string; args: Arg[] };
const KV = "INSERT INTO house_settings(house_id,key,value) VALUES (?,?,?) ON CONFLICT(house_id,key) DO UPDATE SET value=excluded.value";

/**
 * Nạp dữ liệu từ sheet vào MỘT nhà. Hóa đơn nạp vào được KHÓA (không tự tính lại).
 * Tháng mới nhất: chưa thu (trừ khi sheet ghi đã thanh toán). Các tháng trước: mặc định đã thu đủ.
 * Tự tạo phòng chưa có. Chạy lại nhiều lần an toàn: hóa đơn cùng phòng + tháng được thay mới, giữ nguyên link khách.
 */
export async function runImport(data: ImportData, opts: { houseId: number; houseName: string; dry: boolean; applySettings: boolean }): Promise<ImportResult> {
  const notes: string[] = [];
  let invCount = 0, payCount = 0, grand = 0, newRooms = 0, ledgerCount = 0;
  const latest = data.months[data.months.length - 1];
  const H = opts.houseId;

  // Đọc trước dữ liệu cần thiết (ít truy vấn = nhanh khi database ở xa)
  const rooms = await all<{ id: number; code: string }>("SELECT id, code FROM rooms WHERE house_id=?", H);
  const roomByCode = new Map(rooms.map((r) => [r.code, r.id]));

  // 1) Tạo phòng + khách thuê còn thiếu (theo tháng mới nhất)
  const missing = latest.rooms.filter((d) => d.total > 0 && !roomByCode.has(d.room));
  if (missing.length) {
    newRooms = missing.length;
    if (!opts.dry) {
      const st: Stmt[] = [];
      for (const d of missing) {
        const dueDay = d.due ? Number(d.due.slice(8, 10)) || 15 : 15;
        st.push({ sql: "INSERT OR IGNORE INTO rooms(house_id, code, rent, due_day) VALUES (?,?,?,?)", args: [H, d.room, d.rent, dueDay] });
        st.push({
          sql: "INSERT INTO tenants(room_id, name, people, move_in) SELECT id,?,?,? FROM rooms WHERE house_id=? AND code=? AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.room_id=rooms.id AND t.active=1)",
          args: [`Khách phòng ${d.room}`, Math.max(1, Math.round(d.people) || 1), `${latest.month}-01`, H, d.room],
        });
      }
      await batch(st);
      for (const r of await all<{ id: number; code: string }>("SELECT id, code FROM rooms WHERE house_id=?", H)) roomByCode.set(r.code, r.id);
    } else {
      missing.forEach((d, i) => roomByCode.set(d.room, -1 - i));
    }
    notes.push(`Sẽ tạo ${missing.length} phòng mới: ${missing.map((d) => d.room).join(", ")} (tên khách để "Khách phòng …", sửa trong trang Phòng)`);
  }

  const tenantByRoom = new Map((await all<{ room_id: number; name: string }>("SELECT room_id, name FROM tenants WHERE active=1 AND room_id IN (SELECT id FROM rooms WHERE house_id=?)", H)).map((t) => [t.room_id, t.name]));
  const invoiceId = new Map((await all<{ id: number; room_id: number; month: string }>("SELECT id, room_id, month FROM invoices WHERE room_id IN (SELECT id FROM rooms WHERE house_id=?)", H)).map((i) => [`${i.room_id}|${i.month}`, i.id]));

  const stmts: Stmt[] = [];

  // 2) Cài đặt của nhà (giá điện nước, dịch vụ, tài khoản nhận tiền)
  if (opts.applySettings) {
    const s = data.settings;
    const kv: [string, string][] = [];
    if (s) {
      if (s.elec_price != null) kv.push(["elec_price", String(s.elec_price)]);
      if (s.water_mode) kv.push(["water_mode", s.water_mode]);
      if (s.water_price != null) kv.push(["water_price", String(s.water_price)]);
      if (s.rent_cost_monthly != null) kv.push(["rent_cost_monthly", String(s.rent_cost_monthly)]);
      if (s.manager_salary != null) kv.push(["manager_salary", String(s.manager_salary)]);
      if (s.partners != null) kv.push(["partners", s.partners]);
    } else {
      kv.push(["elec_price", "4000"], ["water_mode", "meter"], ["water_price", "35000"]);
    }
    if (data.bank) kv.push(["bank_code", data.bank.code], ["bank_account", data.bank.account], ["bank_holder", data.bank.holder]);
    for (const [k, v] of kv) stmts.push({ sql: KV, args: [H, k, v] });
    const services = s?.services ?? [["Wifi", "room", 100000], ["Vệ sinh, rác, điện chung, sạc xe", "person", 50000], ["Máy giặt", "person", 50000]] as [string, "room" | "person", number][];
    stmts.push({ sql: "DELETE FROM services WHERE house_id=?", args: [H] });
    for (const [name, type, price] of services) stmts.push({ sql: "INSERT INTO services(house_id,name,type,price) VALUES (?,?,?,?)", args: [H, name, type, price] });
    if (data.bank) notes.push(`Tài khoản nhận tiền sẽ đặt: ${data.bank.code} · ${data.bank.holder} (đọc từ dòng STK của sheet, kiểm tra lại trong Cài đặt)`);
  }

  // 3) Hóa đơn, khoản thu, chỉ số điện nước
  for (const m of data.months) {
    const isLatest = m === latest;
    let monthTotal = 0;
    for (const d of m.rooms) {
      if (!(d.total > 0)) continue;
      const roomId = roomByCode.get(d.room);
      if (roomId === undefined) { notes.push(`Bỏ qua phòng ${d.room} (chưa có trong web)`); continue; }
      const tenantName = tenantByRoom.get(roomId) ?? `Khách phòng ${d.room}`;
      const lines: [string, string, number][] = [];
      if (d.rent) lines.push(["Tiền phòng", `Kỳ ${d.period || ""}`.trim(), d.rent]);
      if (d.elec_new || d.elec_old || d.elec_amount) {
        const kwh = d.elec_new - d.elec_old;
        lines.push(["Tiền điện", kwh > 0 ? `${d.elec_old} → ${d.elec_new} = ${kwh} kWh × ${vnd(d.elec_amount / kwh)}` : `${d.elec_old} → ${d.elec_new}`, d.elec_amount]);
      }
      if (d.water_new || d.water_old || d.water_amount) {
        const m3 = d.water_new - d.water_old;
        lines.push(["Tiền nước", m3 > 0 ? `${d.water_old} → ${d.water_new} = ${m3} m³ × ${vnd(d.water_amount / m3)}` : `${d.water_old} → ${d.water_new}`, d.water_amount]);
      } else if (d.water_amount) {
        lines.push(["Tiền nước", d.people ? `${d.people} người` : "", d.water_amount]);
      }
      if (d.service) lines.push(["Vệ sinh, rác, điện chung, sạc xe", d.people ? `${d.people} người` : "", d.service]);
      if (d.washer) lines.push(["Máy giặt", "", d.washer]);
      if (d.wifi) lines.push(["Wifi", "", d.wifi]);
      if (d.adjust) lines.push(["Giảm tiền phòng / nợ cũ", "Theo sheet", d.adjust]);
      const sum = lines.reduce((a, l) => a + l[2], 0);
      if (sum !== d.total) {
        lines.push(["Điều chỉnh (theo tổng trong sheet)", "Sheet tính tổng khác tổng các dòng", d.total - sum]);
        notes.push(`${m.month} phòng ${d.room}: điều chỉnh ${vnd(d.total - sum)} để khớp tổng sheet ${vnd(d.total)}`);
      }
      const due = d.due || `${m.month}-15`;
      const oldId = invoiceId.get(`${roomId}|${m.month}`);
      const people = Math.max(1, Math.round(d.people) || 1);
      if (oldId) {
        stmts.push({ sql: "DELETE FROM payments WHERE invoice_id=?", args: [oldId] });
        stmts.push({ sql: "DELETE FROM invoice_lines WHERE invoice_id=?", args: [oldId] });
        stmts.push({ sql: "UPDATE invoices SET tenant_name=?, people=?, prev_debt=0, total=?, due_date=?, locked=1 WHERE id=?", args: [tenantName, people, d.total, due, oldId] });
      } else {
        stmts.push({
          sql: "INSERT INTO invoices(room_id,month,tenant_name,people,prev_debt,total,due_date,token,locked) VALUES (?,?,?,?,0,?,?,?,1)",
          args: [roomId, m.month, tenantName, people, d.total, due, crypto.randomBytes(12).toString("hex")],
        });
      }
      const where = oldId ? "?" : "(SELECT id FROM invoices WHERE room_id=? AND month=?)";
      const whereArgs: Arg[] = oldId ? [oldId] : [roomId, m.month];
      for (const [label, detail, amount] of lines) {
        stmts.push({ sql: `INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES (${where},?,?,?)`, args: [...whereArgs, label, detail, amount] });
      }
      // Đã thu: sheet ghi rõ thì theo sheet; không ghi thì tháng cũ = đã thu đủ, tháng mới nhất = chưa thu
      const paid = d.paid != null && d.paid > 0 ? Math.min(d.paid, d.total) : isLatest ? 0 : d.total;
      if (paid > 0) {
        stmts.push({ sql: `INSERT INTO payments(invoice_id,amount,method,paid_at,note) VALUES (${where},?,?,?,?)`, args: [...whereArgs, paid, "bank", due, d.paid ? "Theo sheet" : "Mặc định: đã thu (nhập từ sheet)"] });
        payCount++;
      }
      stmts.push({
        sql: `INSERT INTO readings(room_id,month,elec_old,elec_new,water_old,water_new) VALUES (?,?,?,?,?,?)
              ON CONFLICT(room_id,month) DO UPDATE SET elec_old=excluded.elec_old, elec_new=excluded.elec_new, water_old=excluded.water_old, water_new=excluded.water_new`,
        args: [roomId, m.month, d.elec_old, d.elec_new, d.water_old, d.water_new],
      });
      invCount++;
      monthTotal += d.total;
      grand += d.total;
    }
    const newThu = m.ledger.filter((l) => l.kind === "thu").reduce((a, l) => a + l.amount, 0);
    if (m.sheet_thu != null && Math.abs(m.sheet_thu - monthTotal - newThu) > 1) {
      notes.push(`Tháng ${m.month}: tổng hóa đơn ${vnd(monthTotal + newThu)} khác "Tổng thu" trong sheet ${vnd(m.sheet_thu)} (chênh ${vnd(monthTotal + newThu - m.sheet_thu)}, do cách tính của sheet)`);
    }
  }

  // 4) Sổ thu chi (chi phí, thu ngoài hóa đơn) — thay thế phần đã nhập từ sheet của các tháng này
  const months = data.months.map((m) => m.month);
  stmts.push({ sql: `DELETE FROM ledger WHERE house_id=? AND source='import' AND month IN (${months.map(() => "?").join(",")})`, args: [H, ...months] });
  for (const m of data.months) {
    for (const l of m.ledger) {
      stmts.push({ sql: "INSERT INTO ledger(house_id,month,kind,category,name,amount,source) VALUES (?,?,?,?,?,?,'import')", args: [H, m.month, l.kind, l.category, l.name, l.amount] });
      ledgerCount++;
    }
  }

  const summary =
    `${opts.dry ? "KIỂM TRA (chưa ghi gì): " : "ĐÃ NẠP: "}nhà "${opts.houseName}" — ${invCount} hóa đơn, ${payCount} khoản đã thu, ${ledgerCount} dòng thu chi, ` +
    `tổng hóa đơn ${vnd(grand)} (${data.months[0].month} đến ${latest.month})` + (newRooms ? `, ${newRooms} phòng mới` : "") + ".";
  if (!opts.dry && invCount > 0) {
    // Chia nhỏ để không vượt giới hạn kích thước một yêu cầu. Nạp lại an toàn: dữ liệu cùng phòng + tháng được thay mới.
    for (let i = 0; i < stmts.length; i += 400) await batch(stmts.slice(i, i + 400));
  }
  return { summary, notes, houseName: opts.houseName };
}
