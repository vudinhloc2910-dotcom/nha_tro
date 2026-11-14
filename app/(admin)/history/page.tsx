import Link from "next/link";
import { all } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { currentMonth, vnd } from "@/lib/format";
import { cardCls, tdCls, thCls } from "@/lib/ui";

type Row = { month: string; n: number; total: number; paid: number; fully: number };

/** Lịch sử thu tiền từng tháng của nhà đang chọn (năm 2026, 2027...). */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const thisYear = Number(currentMonth().slice(0, 4));
  const year = /^20\d{2}$/.test(sp.year ?? "") ? Number(sp.year) : Math.min(Math.max(thisYear, 2026), 2027);
  const rows = await all<Row>(
    `SELECT i.month, COUNT(*) n, SUM(i.total) total,
       SUM(MIN(i.total, COALESCE(p.paid,0))) paid,
       SUM(CASE WHEN COALESCE(p.paid,0) >= i.total THEN 1 ELSE 0 END) fully
     FROM invoices i JOIN rooms r ON r.id=i.room_id
     LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id=i.id
     WHERE r.house_id=? AND i.month LIKE ? GROUP BY i.month`,
    house.id, `${year}-%`
  );
  const by = new Map(rows.map((r) => [r.month, r]));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid }), { total: 0, paid: 0 });
  const now = currentMonth();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lịch sử thu tiền {year}</h1>
          <p className="text-sm text-gray-600">{house.name}{house.address ? ` · ${house.address}` : ""}</p>
        </div>
        <div className="flex gap-2">
          {[2025, 2026, 2027].map((y) => (
            <Link key={y} href={`/history?year=${y}`} className={`rounded-md border px-3 py-1.5 text-sm ${y === year ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"}`}>{y}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={cardCls}><div className="text-xs text-gray-500">Phải thu cả năm</div><div className="mt-1 text-base font-bold sm:text-lg">{vnd(sum.total)}</div></div>
        <div className={cardCls}><div className="text-xs text-gray-500">Đã thu</div><div className="mt-1 text-base font-bold text-green-700 sm:text-lg">{vnd(sum.paid)}</div></div>
        <div className={cardCls}><div className="text-xs text-gray-500">Còn nợ</div><div className={`mt-1 text-base font-bold sm:text-lg ${sum.total - sum.paid > 0 ? "text-red-700" : ""}`}>{vnd(sum.total - sum.paid)}</div></div>
      </div>

      <section className={`${cardCls} overflow-x-auto`}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={thCls}>Tháng</th><th className={`${thCls} text-right`}>Phải thu</th><th className={`${thCls} text-right`}>Đã thu</th>
              <th className={`${thCls} text-right`}>Còn nợ</th><th className={thCls}>Phòng đã đóng đủ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {months.map((m) => {
              const r = by.get(m);
              const debt = r ? r.total - r.paid : 0;
              return (
                <tr key={m} className={m === now ? "bg-blue-50" : ""}>
                  <td className={tdCls}><Link className="font-medium text-blue-700 hover:underline" href={`/invoices?month=${m}`}>Tháng {m.slice(5)}/{year}</Link></td>
                  {r ? (
                    <>
                      <td className={`${tdCls} text-right`}>{vnd(r.total)}</td>
                      <td className={`${tdCls} text-right text-green-700`}>{vnd(r.paid)}</td>
                      <td className={`${tdCls} text-right ${debt > 0 ? "font-medium text-red-700" : ""}`}>{vnd(debt)}</td>
                      <td className={tdCls}>{r.fully}/{r.n} phòng {r.fully === r.n ? "✓" : ""}</td>
                    </>
                  ) : (
                    <td className={`${tdCls} text-gray-500`} colSpan={4}>Chưa có hóa đơn</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
