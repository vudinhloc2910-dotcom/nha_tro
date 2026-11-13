import Link from "next/link";
import { all } from "@/lib/db";
import { invoicesOfMonth } from "@/lib/queries";
import { currentMonth, dateVN, monthLabel, vnd } from "@/lib/format";
import { MonthPicker, StatusBadge } from "../components";
import { cardCls, tdCls, thCls } from "@/lib/ui";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const invoices = await invoicesOfMonth(month);
  const rooms = await all<{ id: number; code: string; tenants: number }>(
    "SELECT r.id, r.code, (SELECT COUNT(*) FROM tenants t WHERE t.room_id=r.id AND t.active=1) tenants FROM rooms r ORDER BY r.code"
  );
  const billed = invoices.reduce((a, i) => a + i.total, 0);
  const paid = invoices.reduce((a, i) => a + Math.min(i.paid, i.total), 0);
  const owed = billed - paid;
  const overdue = invoices.filter((i) => i.status === "overdue");
  const occupied = rooms.filter((r) => r.tenants > 0).length;
  const missing = rooms.filter((r) => r.tenants > 0 && !invoices.some((i) => i.room_id === r.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tổng quan tháng {monthLabel(month)}</h1>
        <MonthPicker action="/" month={month} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Phải thu" value={vnd(billed)} />
        <Stat label="Đã thu" value={vnd(paid)} tone="text-green-700" />
        <Stat label="Còn nợ" value={vnd(owed)} tone={owed > 0 ? "text-red-700" : undefined} />
        <Stat label="Phòng có khách" value={`${occupied}/${rooms.length}`} />
      </div>

      {missing.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Chưa có hóa đơn tháng này: phòng {missing.map((r) => r.code).join(", ")}.{" "}
          <Link href={`/readings?month=${month}`} className="underline">Nhập điện nước</Link> rồi{" "}
          <Link href={`/invoices?month=${month}`} className="underline">tạo hóa đơn</Link>.
        </div>
      )}

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Công nợ theo phòng</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có hóa đơn tháng này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className={thCls}>Phòng</th><th className={thCls}>Hạn</th><th className={`${thCls} text-right`}>Phải thu</th><th className={`${thCls} text-right`}>Đã thu</th><th className={thCls}>Trạng thái</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className={tdCls}><Link className="font-medium text-blue-700 hover:underline" href={`/invoices/${i.id}`}>{i.code}</Link></td>
                    <td className={tdCls}>{dateVN(i.due_date)}</td>
                    <td className={`${tdCls} text-right`}>{vnd(i.total)}</td>
                    <td className={`${tdCls} text-right`}>{vnd(i.paid)}</td>
                    <td className={tdCls}><StatusBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {overdue.length > 0 && (
        <p className="text-sm text-red-700">Quá hạn: phòng {overdue.map((i) => i.code).join(", ")}.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cardCls}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
