import crypto from "node:crypto";
import { all, batch } from "./db";
import { vnd } from "./format";

export type ImportRoom = {
  room: string; elec_old: number; elec_new: number; elec_amount: number;
  water_old: number; water_new: number; water_amount: number; people: number;
  service: number; washer: number; wifi: number; rent: number; adjust: number; total: number;
  period: string; due: string | null;
};
export type ImportData = { months: { month: string; rooms: ImportRoom[] }[] };
export type ImportResult = { summary: string; notes: string[] };

const NUM_FIELDS = [
  "elec_old", "elec_new", "elec_amount", "water_old", "water_new", "water_amount", "people",
  "service", "washer", "wifi", "rent", "adjust", "total",
] as const;

/** Kiểm tra file JSON người dùng tải lên: sai cấu trúc thì báo lỗi rõ ràng. */
export function parseImport(raw: unknown): ImportData {
  const months = (raw as { months?: unknown })?.months;
  if (!Array.isArray(months) || months.length === 0 || months.length > 36) throw new Error("File không đúng định dạng (thiếu danh sách tháng).");
  const out: ImportData = { months: [] };
  for (const m of months) {
    const month = String((m as { month?: unknown })?.month ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Tháng "${month}" không hợp lệ.`);
    const rooms = (m as { rooms?: unknown }).rooms;
    if (!Array.isArray(rooms) || rooms.length === 0 || rooms.length > 100) throw new Error(`Tháng ${month}: thiếu danh sách phòng.`);
    const list: ImportRoom[] = [];
    for (const r of rooms as Record<string, unknown>[]) {
      const room = String(r.room ?? "").trim();
      if (!room || room.length > 20) throw new Error(`Tháng ${month}: có phòng không hợp lệ.`);
      const o = { room, period: String(r.period ?? "").slice(0, 40), due: null as string | null } as ImportRoom;
      for (const k of NUM_FIELDS) {
        const v = Number(r[k] ?? 0);
        if (!Number.isFinite(v) || Math.abs(v) > 1e10) throw new Error(`Tháng ${month} phòng ${room}: số "${k}" không hợp lệ.`);
        (o as unknown as Record<string, number>)[k] = v;
      }
      const due = typeof r.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null;
      o.due = due;
      list.push(o);
    }
    out.months.push({ month, rooms: list });
  }
  out.months.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

type Stmt = { sql: string; args: (string | number | null)[] };

/**
 * Nạp hóa đơn từ sheet. Hóa đơn nạp vào được KHÓA (không tự tính lại).
 * Tháng mới nhất: chưa thu. Các tháng trước: mặc định đã thu đủ.
 * Chạy lại nhiều lần an toàn: hóa đơn cùng phòng + tháng được thay mới, giữ nguyên link khách.
 */
export async function runImport(data: ImportData, opts: { dry: boolean; applySettings: boolean }): Promise<ImportResult> {
  const stmts: Stmt[] = [];
  const notes: string[] = [];
  let invCount = 0, payCount = 0, grand = 0;
  const latest = data.months[data.months.length - 1];

  // Đọc trước toàn bộ dữ liệu cần thiết bằng 3 truy vấn (nhanh hơn nhiều khi database ở xa)
  const roomByCode = new Map((await all<{ id: number; code: string }>("SELECT id, code FROM rooms")).map((r) => [r.code, r.id]));
  const tenantByRoom = new Map((await all<{ room_id: number; name: string }>("SELECT room_id, name FROM tenants WHERE active=1")).map((t) => [t.room_id, t.name]));
  const invoiceId = new Map((await all<{ id: number; room_id: number; month: string }>("SELECT id, room_id, month FROM invoices")).map((i) => [`${i.room_id}|${i.month}`, i.id]));

  if (opts.applySettings) {
    for (const [k, v] of Object.entries({ elec_price: "4000", water_mode: "meter", water_price: "35000" })) {
      stmts.push({ sql: "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [k, v] });
    }
    stmts.push({ sql: "DELETE FROM services", args: [] });
    for (const [name, type, price] of [["Wifi", "room", 100000], ["Vệ sinh, rác, điện chung, sạc xe", "person", 50000], ["Máy giặt", "person", 50000]] as const) {
      stmts.push({ sql: "INSERT INTO services(name,type,price) VALUES (?,?,?)", args: [name, type, price] });
    }
  }

  for (const m of data.months) {
    const isLatest = m === latest;
    for (const d of m.rooms) {
      if (!(d.total > 0)) continue;
      const roomId = roomByCode.get(d.room);
      if (!roomId) { notes.push(`Bỏ qua phòng ${d.room} (chưa có trong web)`); continue; }
      const room = { id: roomId };
      const tenant = { name: tenantByRoom.get(roomId) ?? "" };
      const lines: [string, string, number][] = [];
      if (d.rent) lines.push(["Tiền phòng", `Kỳ ${d.period || ""}`.trim(), d.rent]);
      if (d.elec_new || d.elec_old || d.elec_amount) {
        const kwh = d.elec_new - d.elec_old;
        lines.push(["Tiền điện", kwh > 0 ? `${d.elec_old} → ${d.elec_new} = ${kwh} kWh × ${vnd(d.elec_amount / kwh)}` : `${d.elec_old} → ${d.elec_new}`, d.elec_amount]);
      }
      if (d.water_new || d.water_old || d.water_amount) {
        const m3 = d.water_new - d.water_old;
        lines.push(["Tiền nước", m3 > 0 ? `${d.water_old} → ${d.water_new} = ${m3} m³ × ${vnd(d.water_amount / m3)}` : `${d.water_old} → ${d.water_new}`, d.water_amount]);
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
      const oldId = invoiceId.get(`${room.id}|${m.month}`);
      const old = oldId ? { id: oldId } : undefined;
      const people = Math.max(1, Math.round(d.people) || 1);
      if (old) {
        stmts.push({ sql: "DELETE FROM payments WHERE invoice_id=?", args: [old.id] });
        stmts.push({ sql: "DELETE FROM invoice_lines WHERE invoice_id=?", args: [old.id] });
        stmts.push({ sql: "UPDATE invoices SET tenant_name=?, people=?, prev_debt=0, total=?, due_date=?, locked=1 WHERE id=?", args: [tenant.name, people, d.total, due, old.id] });
      } else {
        stmts.push({
          sql: "INSERT INTO invoices(room_id,month,tenant_name,people,prev_debt,total,due_date,token,locked) VALUES (?,?,?,?,0,?,?,?,1)",
          args: [room.id, m.month, tenant.name, people, d.total, due, crypto.randomBytes(12).toString("hex")],
        });
      }
      const where = old ? "?" : "(SELECT id FROM invoices WHERE room_id=? AND month=?)";
      const whereArgs: (string | number)[] = old ? [old.id] : [room.id, m.month];
      for (const [label, detail, amount] of lines) {
        stmts.push({ sql: `INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES (${where},?,?,?)`, args: [...whereArgs, label, detail, amount] });
      }
      if (!isLatest) {
        stmts.push({ sql: `INSERT INTO payments(invoice_id,amount,method,paid_at,note) VALUES (${where},?,?,?,?)`, args: [...whereArgs, d.total, "bank", due, "Mặc định: đã thu (nhập từ sheet)"] });
        payCount++;
      }
      stmts.push({
        sql: `INSERT INTO readings(room_id,month,elec_old,elec_new,water_old,water_new) VALUES (?,?,?,?,?,?)
              ON CONFLICT(room_id,month) DO UPDATE SET elec_old=excluded.elec_old, elec_new=excluded.elec_new, water_old=excluded.water_old, water_new=excluded.water_new`,
        args: [room.id, m.month, d.elec_old, d.elec_new, d.water_old, d.water_new],
      });
      invCount++;
      grand += d.total;
    }
  }

  if (opts.applySettings) {
    for (const d of latest.rooms) {
      if (d.total > 0) {
        stmts.push({ sql: "UPDATE rooms SET rent=? WHERE code=?", args: [d.rent, d.room] });
        stmts.push({ sql: "UPDATE tenants SET people=? WHERE active=1 AND room_id=(SELECT id FROM rooms WHERE code=?)", args: [Math.max(1, Math.round(d.people) || 1), d.room] });
      }
    }
  }

  const summary = `${opts.dry ? "KIỂM TRA (chưa ghi gì): " : "ĐÃ NẠP: "}${invCount} hóa đơn, ${payCount} khoản thu mặc định, tổng ${vnd(grand)} (${data.months[0].month} đến ${latest.month}).`;
  if (!opts.dry && invCount > 0) await batch(stmts);
  return { summary, notes };
}
