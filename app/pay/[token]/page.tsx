import { notFound } from "next/navigation";
import { all, getSettings, one } from "@/lib/db";
import { dateVN, monthLabel, statusOf, vnd } from "@/lib/format";
import { PrintButton } from "../../print-button";

export const metadata = { title: "Hóa đơn tiền trọ", robots: { index: false, follow: false } };

type Inv = { id: number; code: string; month: string; tenant_name: string; people: number; total: number; due_date: string };

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{24}$/.test(token)) notFound();
  const inv = await one<Inv>("SELECT i.*, r.code FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.token=?", token);
  if (!inv) notFound();
  const s = await getSettings();
  const lines = await all<{ label: string; detail: string; amount: number }>("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY id", inv.id);
  const payments = await all<{ amount: number; paid_at: string; method: string }>("SELECT amount, paid_at, method FROM payments WHERE invoice_id=? ORDER BY paid_at, id", inv.id);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remain = Math.max(0, inv.total - paid);
  const status = statusOf(inv.total, paid, inv.due_date);
  const note = `Phong ${inv.code}`;
  const invNo = `HD-${inv.month.replace("-", "")}-${inv.code}`;
  const qr = s.bank_account
    ? `https://img.vietqr.io/image/${encodeURIComponent(s.bank_code)}-${encodeURIComponent(s.bank_account)}-compact2.png?amount=${remain}&addInfo=${encodeURIComponent(note)}&accountName=${encodeURIComponent(s.bank_holder)}`
    : null;
  const stamp =
    status === "paid" ? { t: "ĐÃ THANH TOÁN", c: "border-green-600 text-green-700" }
    : status === "overdue" ? { t: "QUÁ HẠN", c: "border-red-600 text-red-700" }
    : status === "partial" ? { t: "THU MỘT PHẦN", c: "border-amber-600 text-amber-700" }
    : { t: "CHƯA THANH TOÁN", c: "border-gray-500 text-gray-700" };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 print:max-w-none print:p-0">
      <div className="rounded-lg border border-gray-300 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-blue-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-blue-900">{s.house_name}</h1>
            <p className="text-xs text-gray-600">HÓA ĐƠN TIỀN TRỌ</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Số: {invNo}</p>
            <p className="text-gray-600">Kỳ thu: tháng {monthLabel(inv.month)}</p>
            <p className="text-gray-600">Hạn đóng: {dateVN(inv.due_date)}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-1 text-sm sm:grid-cols-3">
          <p><span className="text-gray-500">Phòng:</span> <b>{inv.code}</b></p>
          <p><span className="text-gray-500">Khách thuê:</span> <b>{inv.tenant_name}</b></p>
          <p><span className="text-gray-500">Số người:</span> <b>{inv.people}</b></p>
        </section>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-blue-50 text-left text-xs uppercase text-gray-600">
              <th className="border border-gray-200 px-3 py-2">Khoản</th>
              <th className="border border-gray-200 px-3 py-2">Chi tiết</th>
              <th className="border border-gray-200 px-3 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="border border-gray-200 px-3 py-2">{l.label}</td>
                <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600">{l.detail}</td>
                <td className={`border border-gray-200 px-3 py-2 text-right ${l.amount < 0 ? "text-green-700" : ""}`}>{vnd(l.amount)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="border border-gray-200 px-3 py-2" colSpan={2}>Tổng cộng</td>
              <td className="border border-gray-200 px-3 py-2 text-right">{vnd(inv.total)}</td>
            </tr>
            {payments.map((p, i) => (
              <tr key={`p${i}`}>
                <td className="border border-gray-200 px-3 py-2" colSpan={2}>Đã thanh toán ngày {dateVN(p.paid_at)} ({p.method === "cash" ? "tiền mặt" : "chuyển khoản"})</td>
                <td className="border border-gray-200 px-3 py-2 text-right text-green-700">-{vnd(p.amount)}</td>
              </tr>
            ))}
            <tr className="font-bold text-red-700">
              <td className="border border-gray-200 px-3 py-2" colSpan={2}>Còn phải thanh toán</td>
              <td className="border border-gray-200 px-3 py-2 text-right">{vnd(remain)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className={`rotate-[-4deg] rounded border-4 px-4 py-2 text-lg font-extrabold tracking-wide ${stamp.c}`}>{stamp.t}</div>
          {remain > 0 && (
            <div className="text-center text-sm">
              <p className="mb-1 font-medium">Quét mã để chuyển khoản</p>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Mã QR chuyển khoản" className="mx-auto w-48" />
              ) : (
                <p className="text-gray-600">Chủ trọ chưa cài số tài khoản.</p>
              )}
            </div>
          )}
        </div>

        {remain > 0 && (
          <section className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
            <p><span className="text-gray-500">Ngân hàng:</span> <b>{s.bank_code}</b> · <span className="text-gray-500">STK:</span> <b>{s.bank_account || "—"}</b></p>
            <p><span className="text-gray-500">Chủ tài khoản:</span> <b>{s.bank_holder}</b></p>
            <p><span className="text-gray-500">Nội dung chuyển khoản:</span> <b>{note}</b></p>
          </section>
        )}
        <p className="mt-4 text-center text-xs text-gray-500">Cảm ơn bạn đã thanh toán đúng hạn. Liên hệ chủ trọ nếu có thắc mắc về hóa đơn.</p>
      </div>
      <div className="no-print mt-4 text-center"><PrintButton label="In hóa đơn / Lưu PDF" /></div>
    </main>
  );
}
