import Link from "next/link";
import { notFound } from "next/navigation";
import { all, one } from "@/lib/db";
import { dateVN, monthLabel, statusOf, today, vnd } from "@/lib/format";
import { addExtra, addPayment, deleteExtra, deletePayment, regenerateInvoice, unlockInvoice } from "../../../actions";
import { Flash, StatusBadge } from "../../../components";
import { PrintButton } from "../../../print-button";
import { btnCls, btnDangerCls, btnGhostCls, cardCls, inputCls, labelCls, tdCls, thCls } from "@/lib/ui";

type Inv = { id: number; room_id: number; code: string; month: string; tenant_name: string; total: number; due_date: string; token: string; locked: number };

export default async function InvoicePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const inv = await one<Inv>("SELECT i.*, r.code FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.id=?", Number(id));
  if (!inv) notFound();
  const lines = await all<{ label: string; detail: string; amount: number }>("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY id", inv.id);
  const payments = await all<{ id: number; amount: number; method: string; paid_at: string; note: string }>(
    "SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_at, id", inv.id
  );
  const extras = await all<{ id: number; name: string; amount: number }>(
    "SELECT id, name, amount FROM extras WHERE room_id=? AND month=? ORDER BY id", inv.room_id, inv.month
  );
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remain = Math.max(0, inv.total - paid);
  const status = statusOf(inv.total, paid, inv.due_date);

  return (
    <div className="space-y-5">
      <div><Link href={`/invoices?month=${inv.month}`} className="text-sm text-blue-700 hover:underline">← Hóa đơn tháng {monthLabel(inv.month)}</Link></div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Phòng {inv.code} — tháng {monthLabel(inv.month)}</h1>
        <StatusBadge status={status} />
        {inv.locked ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Nhập từ sheet (đã khóa)</span> : null}
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className={cardCls}>
        <p className="mb-3 text-sm text-gray-600">Khách: {inv.tenant_name} · Hạn đóng: {dateVN(inv.due_date)}</p>
        <table className="w-full">
          <thead><tr><th className={thCls}>Khoản</th><th className={thCls}>Chi tiết</th><th className={`${thCls} text-right`}>Thành tiền</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l, i) => (
              <tr key={i}><td className={tdCls}>{l.label}</td><td className={`${tdCls} text-xs text-gray-600`}>{l.detail}</td><td className={`${tdCls} text-right`}>{vnd(l.amount)}</td></tr>
            ))}
            <tr className="font-semibold"><td className={tdCls} colSpan={2}>Tổng cộng</td><td className={`${tdCls} text-right`}>{vnd(inv.total)}</td></tr>
            <tr><td className={tdCls} colSpan={2}>Đã thu</td><td className={`${tdCls} text-right`}>{vnd(paid)}</td></tr>
            <tr className="font-semibold text-red-700"><td className={tdCls} colSpan={2}>Còn lại</td><td className={`${tdCls} text-right`}>{vnd(remain)}</td></tr>
          </tbody>
        </table>
        <div className="no-print mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/pay/${inv.token}`} target="_blank" className={btnGhostCls}>Mở trang gửi khách (có QR)</Link>
          <PrintButton />
          {inv.locked ? (
            <form action={unlockInvoice}><input type="hidden" name="invoice_id" value={inv.id} /><button className={btnGhostCls}>Mở khóa</button></form>
          ) : (
            <form action={regenerateInvoice}><input type="hidden" name="invoice_id" value={inv.id} /><button className={btnGhostCls}>Tính lại</button></form>
          )}
        </div>
        <p className="no-print mt-2 text-xs text-gray-500">Gửi khách đường dẫn: <code className="break-all">/pay/{inv.token}</code> (thêm địa chỉ web của bạn ở phía trước).</p>
      </section>

      <section className={`${cardCls} no-print`}>
        <h2 className="mb-3 font-semibold">Thu tiền</h2>
        {payments.length > 0 && (
          <ul className="mb-4 divide-y divide-gray-100 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{dateVN(p.paid_at)} · {p.method === "cash" ? "Tiền mặt" : "Chuyển khoản"} · <b>{vnd(p.amount)}</b>{p.note && ` · ${p.note}`}</span>
                <form action={deletePayment}>
                  <input type="hidden" name="invoice_id" value={inv.id} /><input type="hidden" name="payment_id" value={p.id} />
                  <button className={btnDangerCls}>Xóa</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addPayment} className="grid gap-3 sm:grid-cols-5">
          <input type="hidden" name="invoice_id" value={inv.id} />
          <div><label className={labelCls}>Số tiền (đ)</label><input name="amount" type="number" min="1" defaultValue={remain || ""} required className={inputCls} /></div>
          <div><label className={labelCls}>Hình thức</label><select name="method" className={inputCls}><option value="bank">Chuyển khoản</option><option value="cash">Tiền mặt</option></select></div>
          <div><label className={labelCls}>Ngày thu</label><input name="paid_at" type="date" defaultValue={today()} className={inputCls} /></div>
          <div><label className={labelCls}>Ghi chú</label><input name="note" className={inputCls} /></div>
          <div className="flex items-end"><button className={btnCls}>Ghi nhận</button></div>
        </form>
      </section>

      {!inv.locked && <section className={`${cardCls} no-print`}>
        <h2 className="mb-3 font-semibold">Khoản phát sinh của phòng trong tháng này</h2>
        {extras.length > 0 && (
          <ul className="mb-4 divide-y divide-gray-100 text-sm">
            {extras.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span>{e.name}: <b>{vnd(e.amount)}</b></span>
                <form action={deleteExtra}>
                  <input type="hidden" name="invoice_id" value={inv.id} /><input type="hidden" name="extra_id" value={e.id} />
                  <button className={btnDangerCls}>Xóa</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addExtra} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="invoice_id" value={inv.id} />
          <div className="sm:col-span-2"><label className={labelCls}>Tên khoản (VD: Phí rác môi trường)</label><input name="name" required className={inputCls} /></div>
          <div><label className={labelCls}>Số tiền (đ)</label><input name="amount" type="number" required className={inputCls} /></div>
          <div className="flex items-end"><button className={btnCls}>Thêm</button></div>
        </form>
      </section>}
    </div>
  );
}
