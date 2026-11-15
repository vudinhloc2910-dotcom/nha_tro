import { notFound } from "next/navigation";
import { getSettings, one, readAll } from "@/lib/db";
import { dateVN, monthLabel, statusOf, vnd } from "@/lib/format";
import { PrintButton } from "../../print-button";
import { reportIssue } from "../../actions";

export const metadata = { title: "Hóa đơn tiền trọ", robots: { index: false, follow: false } };

type Inv = { id: number; house_id: number; code: string; month: string; tenant_name: string; people: number; total: number; due_date: string; period_start: string | null };

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ issue?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f]{24}$/.test(token)) notFound();
  const inv = await one<Inv>("SELECT i.*, r.code, r.house_id FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.token=?", token);
  if (!inv) notFound();
  const [s, [linesR, paymentsR]] = await Promise.all([
    getSettings(inv.house_id),
    readAll([
      { sql: "SELECT label, detail, amount FROM invoice_lines WHERE invoice_id=? ORDER BY id", args: [inv.id] },
      { sql: "SELECT amount, paid_at, method FROM payments WHERE invoice_id=? ORDER BY paid_at, id", args: [inv.id] },
    ]),
  ]);
  const lines = linesR as { label: string; detail: string; amount: number }[];
  const payments = paymentsR as { amount: number; paid_at: string; method: string }[];
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
    : status === "partial" ? { t: "ĐÃ THU MỘT PHẦN", c: "border-amber-600 text-amber-700" }
    : { t: "CHƯA THANH TOÁN", c: "border-gray-500 text-gray-700" };
  const dash = "border-t border-dashed border-gray-400";

  return (
    <main className="mx-auto max-w-sm px-3 py-5 print:max-w-none print:p-0">
      <div className="rounded-xl bg-white p-5 text-gray-900 shadow-md print:rounded-none print:shadow-none">
        <header className="text-center">
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-brand-900">Nhà trọ {s.house_name}</h1>
          {s.house_address && <p className="text-xs text-gray-600">{s.house_address}</p>}
          {s.house_phone && <p className="text-xs text-gray-600">ĐT: {s.house_phone}</p>}
          <p className="mt-3 text-base font-bold">HÓA ĐƠN TIỀN TRỌ</p>
          <p className="text-xs text-gray-600">Số: {invNo}</p>
        </header>

        <div className={`${dash} my-3`} />
        <dl className="space-y-1 text-sm">
          <Row k="Phòng" v={inv.code} bold />
          <Row k="Khách thuê" v={inv.tenant_name} />
          <Row k="Kỳ thu" v={inv.period_start ? `${dateVN(inv.period_start)} - ${dateVN(inv.due_date)}` : `Tháng ${monthLabel(inv.month)}`} />
          <Row k="Hạn đóng" v={dateVN(inv.due_date)} />
        </dl>

        <div className={`${dash} my-3`} />
        <ul className="space-y-2 text-sm">
          {lines.map((l, i) => (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <span>{l.label}</span>
                <span className={`whitespace-nowrap font-medium ${l.amount < 0 ? "text-green-700" : ""}`}>{vnd(l.amount)}</span>
              </div>
              {l.detail && <div className="text-xs text-gray-500">{l.detail}</div>}
            </li>
          ))}
        </ul>

        <div className={`${dash} my-3`} />
        <div className="flex items-baseline justify-between text-base font-bold">
          <span>TỔNG CỘNG</span><span>{vnd(inv.total)}</span>
        </div>
        {payments.map((p, i) => (
          <div key={i} className="mt-1 flex items-baseline justify-between text-sm text-green-700">
            <span>Đã thanh toán {dateVN(p.paid_at)}</span><span>-{vnd(p.amount)}</span>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between rounded-md bg-gray-100 px-3 py-2 text-lg font-extrabold">
          <span>CẦN THANH TOÁN</span><span className={remain > 0 ? "text-red-700" : "text-green-700"}>{vnd(remain)}</span>
        </div>

        <div className="mt-4 flex justify-center">
          <div className={`rotate-[-3deg] rounded border-4 px-4 py-1 text-base font-extrabold tracking-wide ${stamp.c}`}>{stamp.t}</div>
        </div>

        {remain > 0 && (
          <>
            <div className={`${dash} my-4`} />
            <div className="text-center">
              <p className="text-sm font-semibold">Quét mã QR để chuyển khoản</p>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Mã QR chuyển khoản" className="mx-auto mt-2 w-64 max-w-full" />
              ) : (
                <p className="mt-2 text-sm text-gray-600">Chủ trọ chưa cài số tài khoản.</p>
              )}
              <div className="mt-2 space-y-0.5 text-sm">
                <p>Ngân hàng: <b>{s.bank_code}</b></p>
                <p>Số tài khoản: <b>{s.bank_account || "—"}</b></p>
                <p>Chủ tài khoản: <b>{s.bank_holder}</b></p>
                <p>Nội dung: <b>{note}</b></p>
              </div>
            </div>
          </>
        )}

        <div className={`${dash} my-4`} />
        <p className="text-center text-xs text-gray-500">Cảm ơn quý khách! Mọi thắc mắc xin liên hệ chủ trọ{s.house_phone ? `: ${s.house_phone}` : ""}.</p>
      </div>
      <div className="no-print mt-4 text-center"><PrintButton label="In hóa đơn / Lưu PDF" /></div>
      <details id="bao-su-co" open={!!sp.issue} className="no-print mt-4 rounded-xl bg-white p-4 text-sm shadow-md">
        <summary className="cursor-pointer font-semibold text-gray-800">Báo sự cố trong phòng</summary>
        {sp.issue === "ok" && <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-green-800">Đã gửi cho chủ trọ. Cảm ơn quý khách!</p>}
        {sp.issue === "short" && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-red-800">Vui lòng mô tả sự cố (ít nhất 3 ký tự).</p>}
        {sp.issue === "limit" && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-red-800">Hôm nay quý khách đã báo nhiều lần. Vui lòng gọi trực tiếp cho chủ trọ.</p>}
        <form action={reportIssue} className="mt-3 space-y-2">
          <input type="hidden" name="token" value={token} />
          <input name="title" required maxLength={120} placeholder="VD: Điều hòa không mát" className="w-full rounded-md border border-gray-300 px-3 py-2" />
          <textarea name="detail" maxLength={500} rows={3} placeholder="Mô tả thêm (không bắt buộc)" className="w-full rounded-md border border-gray-300 px-3 py-2" />
          <button className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">Gửi cho chủ trọ</button>
        </form>
      </details>
    </main>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{k}</dt>
      <dd className={bold ? "font-bold" : "font-medium"}>{v}</dd>
    </div>
  );
}
