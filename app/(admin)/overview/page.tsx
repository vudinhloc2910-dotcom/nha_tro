import Link from "next/link";
import { all, listHouses } from "@/lib/db";
import { currentMonth, monthLabel, vnd } from "@/lib/format";
import { houseReport } from "@/lib/report";
import { selectHouse } from "../../actions";
import { cardCls, tdCls, thCls } from "@/lib/ui";

type Row = { house_id: number; billed: number; paid: number; rooms: number; occupied: number };

/** Tổng quan tất cả các nhà: thu, nợ, phòng trống, lợi nhuận tháng gần nhất. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const houses = await listHouses();
  const inv = await all<{ house_id: number; billed: number; paid: number }>(
    `SELECT r.house_id, SUM(i.total) billed, SUM(MIN(i.total, COALESCE(p.paid,0))) paid
     FROM invoices i JOIN rooms r ON r.id=i.room_id
     LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id=i.id
     WHERE i.month=? GROUP BY r.house_id`, month
  );
  const rooms = await all<{ house_id: number; rooms: number; occupied: number }>(
    `SELECT r.house_id, COUNT(*) rooms, SUM(CASE WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.room_id=r.id AND t.active=1) THEN 1 ELSE 0 END) occupied
     FROM rooms r GROUP BY r.house_id`
  );
  const rows: (Row & { name: string; profit: number | null })[] = [];
  for (const h of houses) {
    const i = inv.find((x) => x.house_id === h.id);
    const r = rooms.find((x) => x.house_id === h.id);
    const rep = await houseReport(h.id, month, month);
    rows.push({ house_id: h.id, name: h.name, billed: i?.billed ?? 0, paid: i?.paid ?? 0, rooms: r?.rooms ?? 0, occupied: r?.occupied ?? 0, profit: rep.months[0]?.profit ?? null });
  }
  const billed = rows.reduce((a, r) => a + r.billed, 0), paid = rows.reduce((a, r) => a + r.paid, 0);
  const totalRooms = rows.reduce((a, r) => a + r.rooms, 0), occ = rows.reduce((a, r) => a + r.occupied, 0);
  const profit = rows.reduce((a, r) => a + (r.profit ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tổng quan các nhà · tháng {monthLabel(month)}</h1>
        <form action="/overview" method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={month} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <button className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">Xem</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Phải thu" value={vnd(billed)} />
        <Card label="Còn nợ" value={vnd(billed - paid)} tone={billed - paid > 0 ? "text-red-700" : undefined} />
        <Card label="Phòng đang thuê" value={`${occ}/${totalRooms}`} />
        <Card label="Lợi nhuận" value={vnd(profit)} tone={profit < 0 ? "text-red-700" : "text-green-700"} />
      </div>

      <section className={`${cardCls} overflow-x-auto`}>
        <table className="w-full">
          <thead>
            <tr><th className={thCls}>Nhà</th><th className={`${thCls} text-right`}>Phải thu</th><th className={`${thCls} text-right`}>Còn nợ</th><th className={thCls}>Phòng</th><th className={`${thCls} text-right`}>Lợi nhuận</th><th className={thCls}></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.house_id}>
                <td className={`${tdCls} font-medium`}>{r.name}</td>
                <td className={`${tdCls} text-right`}>{r.billed ? vnd(r.billed) : <span className="text-gray-400">-</span>}</td>
                <td className={`${tdCls} text-right ${r.billed - r.paid > 0 ? "font-medium text-red-700" : ""}`}>{r.billed ? vnd(r.billed - r.paid) : "-"}</td>
                <td className={tdCls}>{r.rooms ? `${r.occupied}/${r.rooms}${r.occupied < r.rooms ? " (có phòng trống)" : ""}` : <span className="text-gray-400">chưa có phòng</span>}</td>
                <td className={`${tdCls} text-right ${r.profit != null && r.profit < 0 ? "text-red-700" : ""}`}>{r.profit != null ? vnd(r.profit) : "-"}</td>
                <td className={tdCls}>
                  <form action={selectHouse}>
                    <input type="hidden" name="house" value={r.house_id} />
                    <input type="hidden" name="back" value="/" />
                    <button className="text-sm text-blue-700 hover:underline">Mở</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">Lợi nhuận chỉ hiện khi tháng đó đã có hóa đơn hoặc sổ thu chi. <Link className="text-blue-700 hover:underline" href="/reports">Xem báo cáo chi tiết từng nhà</Link></p>
      </section>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cardCls}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-base font-bold sm:text-lg ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
