import crypto from "node:crypto";
import { batch, batchRows, one } from "./db";
import { computeInvoice } from "./calc";
import { loadMonth, type RoomView } from "./monthdata";

type Stmt = { sql: string; args: (string | number | null)[] };
export type SavedInvoice = { id: number; token: string; total: number; paid: number; due: string; locked: boolean; state: string };

const WHERE_INV = "(SELECT id FROM invoices WHERE room_id=? AND month=?)";

/** Các lệnh ghi hóa đơn của một phòng (tạo mới hoặc tính lại), dùng chung để gom nhiều phòng vào MỘT lượt gọi database. */
function invoiceStmts(view: RoomView, month: string, houseId: number | undefined): Stmt[] {
  const { lines, total } = computeInvoice(view.input);
  const i = view.input;
  const isNew = !view.invoice;
  const st: Stmt[] = [];
  if (isNew) {
    st.push({
      sql: "INSERT OR IGNORE INTO invoices(room_id,month,tenant_name,people,prev_debt,total,due_date,period_start,token) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [view.id, month, view.tenantName, i.people, i.debt, total, i.periodEnd, i.periodStart, crypto.randomBytes(12).toString("hex")],
    });
  }
  st.push({
    sql: "UPDATE invoices SET tenant_name=?, people=?, prev_debt=?, total=?, due_date=?, period_start=?, locked=0 WHERE room_id=? AND month=?",
    args: [view.tenantName, i.people, i.debt, total, i.periodEnd, i.periodStart, view.id, month],
  });
  st.push({ sql: `DELETE FROM invoice_lines WHERE invoice_id=${WHERE_INV}`, args: [view.id, month] });
  for (const l of lines) st.push({ sql: `INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES (${WHERE_INV},?,?,?)`, args: [view.id, month, l.label, l.detail, l.amount] });
  if (isNew && houseId) {
    st.push({
      sql: "INSERT INTO activity(house_id, room_id, kind, text, ts) VALUES (?,?,?,?,?)",
      args: [houseId, view.id, "invoice", `Tạo hóa đơn T${month.slice(5)} phòng ${view.code}: ${total.toLocaleString("vi-VN")}đ`, new Date().toISOString()],
    });
  }
  return st;
}

/** Ghi hóa đơn của một phòng bằng MỘT lượt gọi database. Giữ nguyên id, link khách và các lần thanh toán. */
export async function saveInvoice(view: RoomView, month: string, opts: { force?: boolean; houseId?: number } = {}): Promise<SavedInvoice> {
  // Hóa đơn đã khóa (nhập từ sheet) thì giữ nguyên, trừ khi chủ trọ chủ động sửa (force)
  if (view.invoice?.locked && !opts.force) {
    const v = view.invoice;
    return { id: v.id, token: v.token, total: v.total, paid: v.paid, due: v.due, locked: true, state: v.state };
  }
  const st = invoiceStmts(view, month, opts.houseId);
  st.push({ sql: "SELECT id, token FROM invoices WHERE room_id=? AND month=?", args: [view.id, month] });
  const res = await batchRows(st);
  const row = res[res.length - 1][0] as { id: number; token: string };
  return { id: Number(row.id), token: row.token, total: computeInvoice(view.input).total, paid: view.invoice?.paid ?? 0, due: view.input.periodEnd, locked: false, state: view.invoice?.state ?? "" };
}

/** Tạo hoặc tính lại hóa đơn của 1 phòng trong 1 tháng. */
export async function generateInvoice(roomId: number, month: string, opts: { force?: boolean } = {}): Promise<number | null> {
  const room = await one<{ house_id: number }>("SELECT house_id FROM rooms WHERE id=?", roomId);
  if (!room) return null;
  const md = await loadMonth(room.house_id, month);
  const view = md.rooms.find((r) => r.id === roomId);
  if (!view) return null;
  return (await saveInvoice(view, month, { ...opts, houseId: room.house_id })).id;
}

/** Tạo/tính lại hóa đơn cả tháng của một nhà (bỏ qua hóa đơn đã khóa), tất cả trong MỘT lượt gọi database. */
export async function generateMonth(houseId: number, month: string): Promise<number> {
  const md = await loadMonth(houseId, month);
  const st: Stmt[] = [];
  let n = 0;
  for (const v of md.rooms) {
    if (v.invoice?.locked) continue;
    st.push(...invoiceStmts(v, month, houseId));
    n++;
  }
  // Chia nhỏ nếu quá nhiều lệnh (giới hạn kích thước một lượt gọi)
  for (let i = 0; i < st.length; i += 400) await batch(st.slice(i, i + 400));
  return n;
}
