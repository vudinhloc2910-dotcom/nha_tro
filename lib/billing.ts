import crypto from "node:crypto";
import { all, one, run, batch, getSettings } from "./db";
import { prevMonth, vnd } from "./format";

type Room = { id: number; house_id: number; code: string; rent: number; due_day: number };
type Tenant = { name: string; people: number };
type Line = { label: string; detail: string; amount: number };

/** Tạo hoặc tính lại hóa đơn của 1 phòng trong 1 tháng. Giữ nguyên id, link và các lần thanh toán. */
export async function generateInvoice(roomId: number, month: string): Promise<number | null> {
  const room = await one<Room>("SELECT * FROM rooms WHERE id=?", roomId);
  const tenant = await one<Tenant>("SELECT name, people FROM tenants WHERE room_id=? AND active=1", roomId);
  if (!room || !tenant) return null;
  // Hóa đơn đã khóa (nhập từ sheet) thì giữ nguyên, không tính lại
  const existing = await one<{ id: number; locked: number }>("SELECT id, locked FROM invoices WHERE room_id=? AND month=?", roomId, month);
  if (existing?.locked) return existing.id;
  const s = await getSettings(room.house_id);
  const lines: Line[] = [{ label: "Tiền thuê phòng", detail: "", amount: room.rent }];

  const rd = await one<{ elec_old: number; elec_new: number; water_old: number; water_new: number }>(
    "SELECT * FROM readings WHERE room_id=? AND month=?", roomId, month
  );
  const ePrice = Number(s.elec_price) || 0;
  const wPrice = Number(s.water_price) || 0;
  if (rd) {
    const kwh = Math.max(0, rd.elec_new - rd.elec_old);
    lines.push({ label: "Tiền điện", detail: `${rd.elec_old} → ${rd.elec_new} = ${kwh} kWh × ${vnd(ePrice)}`, amount: Math.round(kwh * ePrice) });
  }
  if (s.water_mode === "person") {
    lines.push({ label: "Tiền nước", detail: `${tenant.people} người × ${vnd(wPrice)}`, amount: tenant.people * wPrice });
  } else if (rd) {
    const m3 = Math.max(0, rd.water_new - rd.water_old);
    lines.push({ label: "Tiền nước", detail: `${rd.water_old} → ${rd.water_new} = ${m3} m³ × ${vnd(wPrice)}`, amount: Math.round(m3 * wPrice) });
  }

  for (const sv of await all<{ name: string; type: string; price: number }>("SELECT * FROM services WHERE active=1 AND house_id=? ORDER BY id", room.house_id)) {
    if (sv.type === "person") lines.push({ label: sv.name, detail: `${tenant.people} người × ${vnd(sv.price)}`, amount: tenant.people * sv.price });
    else lines.push({ label: sv.name, detail: "", amount: sv.price });
  }
  for (const e of await all<{ name: string; amount: number }>("SELECT name, amount FROM extras WHERE room_id=? AND month=? ORDER BY id", roomId, month)) {
    lines.push({ label: e.name, detail: "Phát sinh", amount: e.amount });
  }

  // Nợ kỳ trước = phần còn thiếu của hóa đơn gần nhất trước đó (đã gồm nợ cũ hơn).
  const prev = await one<{ id: number; total: number }>(
    "SELECT id, total FROM invoices WHERE room_id=? AND month<? ORDER BY month DESC LIMIT 1", roomId, month
  );
  let prevDebt = 0;
  if (prev) {
    const paid = (await one<{ p: number }>("SELECT COALESCE(SUM(amount),0) p FROM payments WHERE invoice_id=?", prev.id))!.p;
    prevDebt = Math.max(0, prev.total - paid);
  }
  if (prevDebt > 0) lines.push({ label: "Nợ kỳ trước", detail: `Tháng ${prevMonth(month).slice(5)}/${prevMonth(month).slice(0, 4)}`, amount: prevDebt });

  const total = lines.reduce((a, l) => a + l.amount, 0);
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const due = `${month}-${String(Math.min(Math.max(room.due_day, 1), lastDay)).padStart(2, "0")}`;

  let inv = await one<{ id: number }>("SELECT id FROM invoices WHERE room_id=? AND month=?", roomId, month);
  if (!inv) {
    const r = await run(
      "INSERT INTO invoices(room_id,month,tenant_name,people,prev_debt,total,due_date,token) VALUES (?,?,?,?,?,?,?,?)",
      roomId, month, tenant.name, tenant.people, prevDebt, total, due, crypto.randomBytes(12).toString("hex")
    );
    inv = { id: r.lastInsertRowid };
  }
  await batch([
    { sql: "UPDATE invoices SET tenant_name=?, people=?, prev_debt=?, total=?, due_date=? WHERE id=?", args: [tenant.name, tenant.people, prevDebt, total, due, inv.id] },
    { sql: "DELETE FROM invoice_lines WHERE invoice_id=?", args: [inv.id] },
    ...lines.map((l) => ({ sql: "INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES (?,?,?,?)", args: [inv!.id, l.label, l.detail, l.amount] })),
  ]);
  return inv.id;
}
