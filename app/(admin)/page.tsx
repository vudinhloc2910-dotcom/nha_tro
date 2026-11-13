import Link from "next/link";
import { all } from "@/lib/db";
import { currentMonth, dateVN, monthLabel, prevMonth, statusOf, vnd } from "@/lib/format";
import { saveAndGenerate } from "../actions";
import { Flash, MonthPicker, StatusBadge } from "../components";
import { CopyButton } from "../copy-button";
import { btnCls, cardCls, inputCls } from "@/lib/ui";

type Row = {
  id: number; code: string; tenant: string; people: number;
  cur_eo: number | null; cur_en: number | null; cur_wo: number | null; cur_wn: number | null;
  prev_en: number | null; prev_wn: number | null;
  inv_id: number | null; token: string | null; total: number | null; due_date: string | null; locked: number | null; paid: number;
};

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const rows = await all<Row>(
    `SELECT r.id, r.code, t.name AS tenant, t.people,
       c.elec_old cur_eo, c.elec_new cur_en, c.water_old cur_wo, c.water_new cur_wn,
       p.elec_new prev_en, p.water_new prev_wn,
       i.id inv_id, i.token, i.total, i.due_date, i.locked,
       COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) AS paid
     FROM rooms r
     JOIN tenants t ON t.room_id=r.id AND t.active=1
     LEFT JOIN readings c ON c.room_id=r.id AND c.month=?
     LEFT JOIN readings p ON p.room_id=r.id AND p.month=?
     LEFT JOIN invoices i ON i.room_id=r.id AND i.month=?
     ORDER BY r.code`,
    month, prevMonth(month), month
  );
  const billed = rows.reduce((a, r) => a + (r.total ?? 0), 0);
  const collected = rows.reduce((a, r) => a + Math.min(r.paid, r.total ?? 0), 0);
  const mm = month.slice(5);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Hóa đơn tháng {monthLabel(month)}</h1>
        <MonthPicker action="/" month={month} />
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Phải thu" value={vnd(billed)} />
        <Stat label="Đã thu" value={vnd(collected)} tone="text-green-700" />
        <Stat label="Còn nợ" value={vnd(billed - collected)} tone={billed - collected > 0 ? "text-red-700" : undefined} />
      </div>

      <form action={saveAndGenerate} className={`${cardCls} space-y-4`}>
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="ids" value={rows.map((r) => r.id).join(",")} />
        <p className="text-sm text-gray-600">
          <b>Bước 1:</b> gõ <b>số điện mới</b> và <b>số nước mới</b> của từng phòng (số cũ đã tự điền). <b>Bước 2:</b> bấm <b>Tạo hóa đơn</b>. <b>Bước 3:</b> bấm <b>Chép tin nhắn</b> ở từng phòng rồi dán gửi khách.
        </p>
        <div className="space-y-3">
          {rows.map((r) => {
            const eo = r.cur_eo ?? r.prev_en ?? 0;
            const wo = r.cur_wo ?? r.prev_wn ?? 0;
            const remain = r.total != null ? Math.max(0, r.total - r.paid) : 0;
            const st = r.total != null && r.due_date ? statusOf(r.total, r.paid, r.due_date) : null;
            const path = r.token ? `/pay/${r.token}` : "";
            const msg = `Chào anh/chị phòng ${r.code}, hóa đơn tiền trọ tháng ${mm} là ${vnd(remain || (r.total ?? 0))}. Xem chi tiết và quét QR chuyển khoản: {link}`;
            return (
              <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">Phòng {r.code}</span>
                  <span className="text-sm text-gray-600">{r.tenant} · {r.people} người</span>
                  {st && <StatusBadge status={st} />}
                  {r.locked ? <span className="text-xs text-blue-700">(nhập từ sheet)</span> : null}
                </div>
                <input type="hidden" name={`eo_${r.id}`} value={eo} />
                <input type="hidden" name={`wo_${r.id}`} value={wo} />
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="text-xs text-gray-600">Điện cũ
                    <div className="mt-1 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-900">{eo}</div>
                  </label>
                  <label className="text-xs text-gray-600">Điện mới
                    <input name={`en_${r.id}`} type="number" step="0.1" min="0" defaultValue={r.cur_en ?? ""} placeholder="Nhập số mới" className={`${inputCls} mt-1`} />
                  </label>
                  <label className="text-xs text-gray-600">Nước cũ
                    <div className="mt-1 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-900">{wo}</div>
                  </label>
                  <label className="text-xs text-gray-600">Nước mới
                    <input name={`wn_${r.id}`} type="number" step="0.1" min="0" defaultValue={r.cur_wn ?? ""} placeholder="Nhập số mới" className={`${inputCls} mt-1`} />
                  </label>
                </div>
                {r.token && r.total != null && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                    <span className="text-sm">Tổng: <b>{vnd(r.total)}</b>{remain !== r.total && <> · còn <b className="text-red-700">{vnd(remain)}</b></>}{r.due_date && <span className="text-gray-500"> · hạn {dateVN(r.due_date)}</span>}</span>
                    <span className="ml-auto flex flex-wrap gap-2">
                      <CopyButton path={path} message={msg} label="Chép tin nhắn" primary />
                      <CopyButton path={path} label="Chép link" />
                      <Link href={path} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Xem hóa đơn</Link>
                      <Link href={`/invoices/${r.inv_id}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Thu tiền</Link>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className={`${btnCls} w-full sm:w-auto`}>Tạo hóa đơn</button>
      </form>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cardCls}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-base font-bold sm:text-lg ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
