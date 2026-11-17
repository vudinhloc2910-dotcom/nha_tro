import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { loadLandlordBill } from "@/lib/landlordbill";
import { monthLabel, vnd } from "@/lib/format";
import { LogoMark } from "../../../logo";
import { PrintButton } from "../../../print-button";

export const metadata: Metadata = { title: "Bảng thanh toán tiền nhà", robots: { index: false, follow: false } };

const THANKS = "🌸 Trân trọng cảm ơn Quý khách hàng đã tin tưởng lựa chọn công ty chúng tôi. Kính chúc Quý khách và gia đình luôn dồi dào sức khỏe, bình an và gặp nhiều may mắn! 🌸";

/** Bill thanh toán tiền nhà gửi chủ nhà. Mở bằng link có mã riêng, không cần đăng nhập. */
export default async function LandlordBillPage({ params }: { params: Promise<{ token: string; month: string }> }) {
  const { token, month } = await params;
  if (!/^[a-f0-9]{16,64}$/.test(token) || !/^\d{4}-\d{2}$/.test(month)) notFound();
  const row = await one<{ house_id: number }>("SELECT house_id FROM house_settings WHERE key='landlord_bill_token' AND value=?", token);
  if (!row) notFound();
  const b = await loadLandlordBill(row.house_id, month);
  const dash = "border-t border-dashed border-gray-400";
  const to = b.landlordName.trim() || "Chủ nhà";
  const Group = ({ title, rows, total }: { title: string; rows: { label: string; amount: number }[]; total: number }) => (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className="whitespace-nowrap font-semibold text-red-700">-{vnd(total)}</span>
      </div>
      {rows.length === 0 ? <div className="text-xs text-gray-400">Không có</div> : rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3 pl-3 text-xs text-gray-500"><span>{r.label}</span><span className="whitespace-nowrap">{vnd(r.amount)}</span></div>
      ))}
    </li>
  );
  return (
    <main className="mx-auto max-w-sm px-3 py-5 print:max-w-none print:p-0">
      <div className="rounded-xl bg-white p-5 text-gray-900 shadow-md print:rounded-none print:shadow-none">
        <header className="text-center">
          <LogoMark size={44} className="mx-auto mb-2" />
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-brand-900">{b.houseName}</h1>
          {b.houseAddress && <p className="text-xs text-gray-600">{b.houseAddress}</p>}
          {b.housePhone && <p className="text-xs text-gray-600">ĐT: {b.housePhone}</p>}
          <p className="mt-3 text-base font-bold">BẢNG THANH TOÁN TIỀN NHÀ</p>
          <p className="text-xs text-gray-600">Tháng {monthLabel(month)} · Số: TN-{month.replace("-", "")}</p>
        </header>

        <div className={`${dash} my-3`} />
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Kính gửi</dt><dd className="text-right font-bold">{to}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Kỳ thanh toán</dt><dd className="text-right font-bold">Tháng {monthLabel(month)}</dd></div>
        </dl>

        <div className={`${dash} my-3`} />
        <ul className="space-y-3 text-sm">
          <li className="flex items-baseline justify-between gap-3">
            <span className="font-medium">Tiền thuê nhà hàng tháng</span>
            <span className="whitespace-nowrap font-semibold">{vnd(b.rent)}</span>
          </li>
          <Group title="Trừ tiền điện" total={b.elecTotal} rows={b.elec.map((r) => ({ label: `Phòng ${r.code}`, amount: r.amount }))} />
          <Group title="Trừ tiền nước" total={b.waterTotal} rows={b.water.map((r) => ({ label: `Phòng ${r.code}`, amount: r.amount }))} />
          <Group title="Trừ chi phí phát sinh" total={b.extraTotal} rows={b.extras.map((r) => ({ label: r.name, amount: r.amount }))} />
        </ul>

        <div className={`${dash} my-3`} />
        <div className="flex items-baseline justify-between rounded-md bg-gray-100 px-3 py-2 text-lg font-extrabold">
          <span>{b.pay >= 0 ? "THỰC THANH TOÁN" : "CHỦ NHÀ HOÀN LẠI"}</span>
          <span className={b.pay >= 0 ? "text-brand-900" : "text-green-700"}>{vnd(Math.abs(b.pay))}</span>
        </div>
        <p className="mt-1 text-center text-[11px] text-gray-500">= Tiền thuê nhà − tiền điện − tiền nước − chi phí phát sinh</p>

        <div className={`${dash} my-4`} />
        <p className="text-center text-sm italic leading-relaxed text-gray-700">{THANKS}</p>
      </div>
      <div className="no-print mt-4 text-center"><PrintButton label="In bill / Lưu PDF" /></div>
    </main>
  );
}
