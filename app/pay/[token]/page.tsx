import { notFound } from "next/navigation";
import { all, getSettings, one } from "@/lib/db";
import { dateVN, monthLabel, statusOf, vnd } from "@/lib/format";
import { StatusBadge } from "../../components";
import { thCls, tdCls } from "@/lib/ui";

export const metadata = { title: "Hóa đơn tiền trọ", robots: { index: false, follow: false } };

type Inv = { id: number; code: string; month: string; tenant_name: string; total: number; due_date: string };

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{24}$/.test(token)) notFound();
  const inv = await one<Inv>("SELECT i.*, r.code FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.token=?", token);
  if (!inv) notFound();
  const s = await getSettings();
  const lines = await all<{ label: string; detail: string; amount: number }>("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY id", inv.id);
  const paid = (await one<{ p: number }>("SELECT COALESCE(SUM(amount),0) p FROM payments WHERE invoice_id=?", inv.id))!.p;
  const remain = Math.max(0, inv.total - paid);
  const status = statusOf(inv.total, paid, inv.due_date);
  const note = `Phong ${inv.code}`;
  const qr = s.bank_account
    ? `https://img.vietqr.io/image/${encodeURIComponent(s.bank_code)}-${encodeURIComponent(s.bank_account)}-compact2.png?amount=${remain}&addInfo=${encodeURIComponent(note)}&accountName=${encodeURIComponent(s.bank_holder)}`
    : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-lg font-bold">{s.house_name}</h1>
      <p className="mb-4 text-sm text-gray-600">Hóa đơn phòng {inv.code} — tháng {monthLabel(inv.month)}</p>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span>Khách: {inv.tenant_name}</span><StatusBadge status={status} />
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <table className="w-full">
          <thead><tr><th className={thCls}>Khoản</th><th className={`${thCls} text-right`}>Tiền</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className={tdCls}>{l.label}{l.detail && <div className="text-xs text-gray-500">{l.detail}</div>}</td>
                <td className={`${tdCls} text-right`}>{vnd(l.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td className={tdCls}>Tổng cộng</td><td className={`${tdCls} text-right`}>{vnd(inv.total)}</td></tr>
            <tr><td className={tdCls}>Đã thanh toán</td><td className={`${tdCls} text-right`}>{vnd(paid)}</td></tr>
            <tr className="font-bold text-red-700"><td className={tdCls}>Cần thanh toán</td><td className={`${tdCls} text-right`}>{vnd(remain)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-sm text-gray-600">Hạn đóng: {dateVN(inv.due_date)}</p>
      </div>

      {remain > 0 ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="mb-2 text-sm font-medium">Chuyển khoản</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Mã QR chuyển khoản" className="mx-auto w-64" />
          ) : (
            <p className="text-sm text-gray-600">Chủ trọ chưa cài số tài khoản.</p>
          )}
          <p className="mt-2 text-sm">Nội dung chuyển khoản: <b>{note}</b></p>
          {s.bank_account && <p className="text-sm text-gray-600">{s.bank_code} · {s.bank_account} · {s.bank_holder}</p>}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-center text-sm text-green-800">Đã thanh toán đủ. Cảm ơn bạn!</p>
      )}
    </main>
  );
}
