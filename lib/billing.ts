import crypto from "node:crypto";
import { one, run, batch } from "./db";
import { computeInvoice } from "./calc";
import { loadMonth, type RoomView } from "./monthdata";
import { logActivity } from "./activity";

/** Ghi hóa đơn của một phòng (tạo mới hoặc tính lại). Giữ nguyên id, link khách và các lần thanh toán. */
export async function saveInvoice(view: RoomView, month: string, opts: { force?: boolean } = {}): Promise<number> {
  // Hóa đơn đã khóa (nhập từ sheet) thì giữ nguyên, trừ khi chủ trọ chủ động sửa (force)
  if (view.invoice?.locked && !opts.force) return view.invoice.id;
  const { lines, total } = computeInvoice(view.input);
  const i = view.input;
  let id = view.invoice?.id;
  if (!id) {
    const r = await run(
      "INSERT INTO invoices(room_id,month,tenant_name,people,prev_debt,total,due_date,period_start,token) VALUES (?,?,?,?,?,?,?,?,?)",
      view.id, month, view.tenantName, i.people, i.debt, total, i.periodEnd, i.periodStart, crypto.randomBytes(12).toString("hex")
    );
    id = r.lastInsertRowid;
    const hr = await one<{ house_id: number }>("SELECT house_id FROM rooms WHERE id=?", view.id);
    if (hr) await logActivity(hr.house_id, "invoice", `Tạo hóa đơn T${month.slice(5)} phòng ${view.code}: ${total.toLocaleString("vi-VN")}đ`, view.id);
  }
  await batch([
    { sql: "UPDATE invoices SET tenant_name=?, people=?, prev_debt=?, total=?, due_date=?, period_start=?, locked=0 WHERE id=?", args: [view.tenantName, i.people, i.debt, total, i.periodEnd, i.periodStart, id] },
    { sql: "DELETE FROM invoice_lines WHERE invoice_id=?", args: [id] },
    ...lines.map((l) => ({ sql: "INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES (?,?,?,?)", args: [id!, l.label, l.detail, l.amount] })),
  ]);
  return id;
}

/** Tạo hoặc tính lại hóa đơn của 1 phòng trong 1 tháng. */
export async function generateInvoice(roomId: number, month: string, opts: { force?: boolean } = {}): Promise<number | null> {
  const room = await one<{ house_id: number }>("SELECT house_id FROM rooms WHERE id=?", roomId);
  if (!room) return null;
  const md = await loadMonth(room.house_id, month);
  const view = md.rooms.find((r) => r.id === roomId);
  if (!view) return null;
  return saveInvoice(view, month, opts);
}

/** Tạo/tính lại hóa đơn cả tháng của một nhà (bỏ qua hóa đơn đã khóa). */
export async function generateMonth(houseId: number, month: string): Promise<number> {
  const md = await loadMonth(houseId, month);
  let n = 0;
  for (const v of md.rooms) {
    if (v.invoice?.locked) continue;
    await saveInvoice(v, month);
    n++;
  }
  return n;
}
