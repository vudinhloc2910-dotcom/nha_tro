import { all } from "./db";
import { statusOf, type Status } from "./format";

export type InvoiceRow = {
  id: number; room_id: number; code: string; month: string; tenant_name: string; people: number;
  prev_debt: number; total: number; due_date: string; token: string; paid: number; status: Status; has_reading: number; locked: number;
};

export async function invoicesOfMonth(houseId: number, month: string): Promise<InvoiceRow[]> {
  const rows = await all<Omit<InvoiceRow, "status">>(
    `SELECT i.*, r.code,
       COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) AS paid,
       (SELECT COUNT(*) FROM readings d WHERE d.room_id=i.room_id AND d.month=i.month) AS has_reading
     FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE r.house_id=? AND i.month=? ORDER BY r.code`,
    houseId, month
  );
  return rows.map((r) => ({ ...r, status: statusOf(r.total, r.paid, r.due_date) }));
}

export async function allInvoices(houseId: number): Promise<InvoiceRow[]> {
  const rows = await all<Omit<InvoiceRow, "status">>(
    `SELECT i.*, r.code,
       COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) AS paid,
       (SELECT COUNT(*) FROM readings d WHERE d.room_id=i.room_id AND d.month=i.month) AS has_reading
     FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE r.house_id=? ORDER BY i.month DESC, r.code`,
    houseId
  );
  return rows.map((r) => ({ ...r, status: statusOf(r.total, r.paid, r.due_date) }));
}
