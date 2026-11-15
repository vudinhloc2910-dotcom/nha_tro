import Link from "next/link";
import { listHouses, readAll } from "@/lib/db";
import { ago, recentActivity, type ActKind } from "@/lib/activity";
import { loadAlerts } from "@/lib/alerts";
import { currentMonth, dateVN, monthLabel, vnd } from "@/lib/format";
import { currentHouse } from "@/lib/house";
import { houseReport } from "@/lib/report";
import { houseTodos } from "@/lib/todos";
import { toggleResidence, selectHouse } from "../../actions";
import { MonthPicker } from "../../components";
import { RemindButton } from "../../remind-button";
import { TodoCard } from "../../todo-card";
import { accent, cardCls, tdCls, thCls } from "@/lib/ui";

type Row = { house_id: number; billed: number; paid: number; rooms: number; occupied: number };

const KIND: Record<ActKind, { label: string; cls: string }> = {
  payment: { label: "Thu tiền", cls: "bg-teal-100 text-teal-800" },
  invoice: { label: "Hóa đơn", cls: "bg-sky-100 text-sky-800" },
  checkin: { label: "Khách vào", cls: "bg-violet-100 text-violet-800" },
  checkout: { label: "Trả phòng", cls: "bg-gray-200 text-gray-700" },
  remind: { label: "Nhắc nợ", cls: "bg-amber-100 text-amber-800" },
  expense: { label: "Chi phí", cls: "bg-rose-100 text-rose-800" },
  issue: { label: "Sự cố", cls: "bg-orange-100 text-orange-800" },
};

/** Tổng quan các nhà: số liệu tháng, việc cần xử lý (nợ trễ hạn, hợp đồng sắp hết, phòng trống, tạm trú) và nhật ký hoạt động. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const houses = await listHouses();
  const cur = await currentHouse();
  // Tải song song: tất cả cùng lúc thay vì lần lượt (database ở xa, mỗi lượt gọi tốn thời gian)
  const [todos, [invR, roomsR, issuesR], reports, al, acts] = await Promise.all([
    houseTodos(cur.id),
    readAll([
      { sql: `SELECT r.house_id, SUM(i.total) billed, SUM(MIN(i.total, COALESCE(p.paid,0))) paid
              FROM invoices i JOIN rooms r ON r.id=i.room_id
              LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id=i.id
              WHERE i.month=? GROUP BY r.house_id`, args: [month] },
      { sql: `SELECT r.house_id, COUNT(*) rooms, SUM(CASE WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.room_id=r.id AND t.active=1) THEN 1 ELSE 0 END) occupied
              FROM rooms r GROUP BY r.house_id` },
      { sql: `SELECT i.id, r.code, i.room_id, h.name house, i.title, i.status, i.created FROM issues i JOIN houses h ON h.id=i.house_id
              LEFT JOIN rooms r ON r.id=i.room_id WHERE i.status<>'done' ORDER BY i.id DESC LIMIT 20` },
    ]),
    Promise.all(houses.map((h) => houseReport(h.id, month, month))),
    loadAlerts(),
    recentActivity(15),
  ]);
  const inv = invR as { house_id: number; billed: number; paid: number }[];
  const rooms = roomsR as { house_id: number; rooms: number; occupied: number }[];
  const issues = issuesR as { id: number; code: string | null; room_id: number | null; house: string; title: string; status: string; created: string }[];
  const rows: (Row & { name: string; profit: number | null })[] = houses.map((h, i) => {
    const iv = inv.find((x) => x.house_id === h.id);
    const r = rooms.find((x) => x.house_id === h.id);
    return { house_id: h.id, name: h.name, billed: iv?.billed ?? 0, paid: iv?.paid ?? 0, rooms: r?.rooms ?? 0, occupied: r?.occupied ?? 0, profit: reports[i].months[0]?.profit ?? null };
  });
  const billed = rows.reduce((a, r) => a + r.billed, 0), paid = rows.reduce((a, r) => a + r.paid, 0);
  const totalRooms = rows.reduce((a, r) => a + r.rooms, 0), occ = rows.reduce((a, r) => a + r.occupied, 0);
  const profit = rows.reduce((a, r) => a + (r.profit ?? 0), 0);
  const now = Date.now();
  const overdueTotal = al.overdue.reduce((a, o) => a + o.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tổng quan các nhà · tháng {monthLabel(month)}</h1>
        <MonthPicker action="/overview" month={month} />
      </div>

      <TodoCard houseName={cur.name} todos={todos} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card c="blue" label="Phải thu" value={vnd(billed)} />
        <Card c="rose" label="Còn nợ" value={vnd(billed - paid)} tone={billed - paid > 0 ? "text-red-700" : undefined} />
        <Card c="teal" label="Phòng đang thuê" value={`${occ}/${totalRooms}`} />
        <Card c="violet" label="Lợi nhuận" value={vnd(profit)} tone={profit < 0 ? "text-red-700" : "text-green-700"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Nợ trễ hạn" count={al.overdue.length} tone="rose" sub={overdueTotal ? `${vnd(overdueTotal)} quá hạn` : "Không có phòng nào trễ hạn"}>
          {al.overdue.slice(0, 6).map((o) => (
            <li key={o.roomId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/rooms/${o.roomId}`} className="font-semibold text-brand-800 hover:underline">Phòng {o.code}</Link>
                <span className="ml-2 text-xs text-gray-500">{o.house}</span>
                <div className="truncate text-sm text-gray-600">{o.tenant} · <b className="text-red-700">{vnd(o.amount)}</b> · <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">Trễ {o.days} ngày</span></div>
              </div>
              <RemindButton roomId={o.roomId} code={o.code} month={o.month} amount={o.amount} days={o.days} token={o.token} phone={o.phone} />
            </li>
          ))}
        </Panel>

        <Panel title="Hợp đồng sắp hết" count={al.expiring.length} tone="amber" sub={al.expiring.length ? "Trong 30 ngày tới hoặc đã hết hạn" : "Chưa có hợp đồng nào sắp hết. Nhập ngày hết hợp đồng ở trang phòng."}>
          {al.expiring.slice(0, 6).map((e) => (
            <li key={e.roomId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/rooms/${e.roomId}`} className="font-semibold text-brand-800 hover:underline">Phòng {e.code}</Link>
                <span className="ml-2 text-xs text-gray-500">{e.house}</span>
                <div className="truncate text-sm text-gray-600">{e.tenant} · hết {dateVN(e.end)}</div>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.daysLeft < 0 ? "bg-rose-100 text-rose-800" : e.daysLeft <= 15 ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{e.daysLeft < 0 ? `Quá ${-e.daysLeft} ngày` : e.daysLeft === 0 ? "Hôm nay" : `Còn ${e.daysLeft} ngày`}</span>
            </li>
          ))}
        </Panel>

        <Panel title="Sự cố chưa xử lý" count={issues.length} tone="amber" sub={issues.length ? "Mới báo hoặc đang xử lý" : "Không có sự cố nào"}>
          {issues.slice(0, 6).map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{i.code ? `Phòng ${i.code}` : "Chung cả nhà"}</span><span className="ml-2 text-xs text-gray-500">{i.house}</span>
                <div className="truncate text-sm text-gray-600">{i.title}</div>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${i.status === "open" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{i.status === "open" ? "Mới báo" : "Đang xử lý"}</span>
            </li>
          ))}
        </Panel>

        <Panel title="Phòng trống" count={al.vacant.length} tone="teal" sub={al.vacant.length ? `Mất khoảng ${vnd(al.vacant.reduce((a, v) => a + v.rent, 0))}/tháng` : "Kín phòng"}>
          {al.vacant.slice(0, 6).map((v) => (
            <li key={v.roomId} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/rooms/${v.roomId}`} className="font-semibold text-brand-800 hover:underline">Phòng {v.code}</Link>
                <span className="ml-2 text-xs text-gray-500">{v.house}</span>
              </div>
              <span className="text-sm text-gray-600">{vnd(v.rent)}</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{v.days !== null ? `Trống ${v.days} ngày` : "Trống"}</span>
            </li>
          ))}
        </Panel>

        <Panel title="Khách mới chưa khai tạm trú" count={al.residence.length} tone="violet" sub={al.residence.length ? "Khách vào trong 30 ngày qua. Khai trên VNeID rồi đánh dấu." : "Không có khách nào cần khai"}>
          {al.residence.slice(0, 6).map((x) => (
            <li key={x.roomId} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/rooms/${x.roomId}`} className="font-semibold text-brand-800 hover:underline">Phòng {x.code}</Link>
                <span className="ml-2 text-xs text-gray-500">{x.house}</span>
                <div className="truncate text-sm text-gray-600">{x.tenant} · vào {dateVN(x.moveIn)} ({x.days} ngày trước)</div>
              </div>
              <form action={toggleResidence}>
                <input type="hidden" name="room_id" value={x.roomId} /><input type="hidden" name="done" value="1" /><input type="hidden" name="back" value="/overview" />
                <button className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-50">Đã khai</button>
              </form>
            </li>
          ))}
        </Panel>
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
                    <button className="text-sm text-brand-700 hover:underline">Mở</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">Lợi nhuận chỉ hiện khi tháng đó đã có hóa đơn hoặc sổ thu chi. <Link className="text-brand-700 hover:underline" href="/reports">Xem báo cáo chi tiết từng nhà</Link></p>
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">Nhật ký hoạt động</h2>
        {acts.length === 0 ? <p className="text-sm text-gray-500">Chưa có hoạt động nào. Khi anh tạo hóa đơn, thu tiền, nhắc nợ hay có khách vào/ra, dòng ghi sẽ hiện ở đây.</p> : (
          <ul className="divide-y divide-gray-100">
            {acts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-2.5">
                <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND[a.kind]?.cls ?? "bg-gray-100"}`}>{KIND[a.kind]?.label ?? a.kind}</span>
                <div className="min-w-0 flex-1 text-sm">
                  {a.room_id ? <Link href={`/rooms/${a.room_id}`} className="hover:underline">{a.text}</Link> : a.text}
                  <span className="ml-2 text-xs text-gray-400">{a.house}</span>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{ago(a.ts, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, tone, c }: { label: string; value: string; tone?: string; c?: keyof typeof accent }) {
  return (
    <div className={`${cardCls} ${accent[c ?? "blue"]}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-base font-bold sm:text-lg ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

const TONE = { rose: "border-t-rose-400", amber: "border-t-amber-400", teal: "border-t-teal-400", violet: "border-t-violet-400" } as const;
function Panel({ title, count, sub, tone, children }: { title: string; count: number; sub: string; tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-stone-200 border-t-4 bg-white shadow-sm ${TONE[tone]}`}>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-lg font-extrabold">{count}</span>
      </div>
      <p className="px-4 pb-2 text-xs text-gray-500">{sub}</p>
      {count > 0 && <ul className="divide-y divide-gray-100 border-t border-gray-100">{children}</ul>}
      {count > 6 && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">Và {count - 6} mục khác.</p>}
    </section>
  );
}
