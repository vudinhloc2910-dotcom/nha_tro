import { selectedMonth } from "@/lib/month";
import Link from "next/link";
import { listHouses, readAll } from "@/lib/db";
import { ago, recentActivity, type ActKind } from "@/lib/activity";
import { loadAlerts } from "@/lib/alerts";
import { currentMonth, dateVN, monthLabel, prevMonth, vnd } from "@/lib/format";
import { currentHouse } from "@/lib/house";
import { houseReport } from "@/lib/report";
import { houseTodos } from "@/lib/todos";
import { toggleResidence, selectHouse } from "../../actions";
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
  contract: { label: "Hợp đồng", cls: "bg-indigo-100 text-indigo-800" },
};

/** Tổng quan các nhà: số liệu tháng, việc cần xử lý (nợ trễ hạn, hợp đồng sắp hết, phòng trống, tạm trú) và nhật ký hoạt động. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = await selectedMonth();
  const houses = await listHouses();
  const cur = await currentHouse();
  // Tải song song: tất cả cùng lúc thay vì lần lượt (database ở xa, mỗi lượt gọi tốn thời gian)
  // 6 tháng gần nhất (tính đến tháng đang chọn) để vẽ biểu đồ xu hướng
  let from = month;
  for (let k = 0; k < 5; k++) from = prevMonth(from);
  const [todos, [invR, roomsR, issuesR, seriesR], reports, al, acts] = await Promise.all([
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
      { sql: `SELECT i.month, SUM(i.total) billed, SUM(MIN(i.total, COALESCE(p.paid,0))) paid
              FROM invoices i LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id=i.id
              WHERE i.month BETWEEN ? AND ? GROUP BY i.month`, args: [from, month] },
    ]),
    Promise.all(houses.map((h) => houseReport(h.id, from, month))),
    loadAlerts(),
    recentActivity(15),
  ]);
  const inv = invR as { house_id: number; billed: number; paid: number }[];
  const rooms = roomsR as { house_id: number; rooms: number; occupied: number }[];
  const issues = issuesR as { id: number; code: string | null; room_id: number | null; house: string; title: string; status: string; created: string }[];
  const series = seriesR as { month: string; billed: number; paid: number }[];
  const rows: (Row & { name: string; profit: number | null })[] = houses.map((h, i) => {
    const iv = inv.find((x) => x.house_id === h.id);
    const r = rooms.find((x) => x.house_id === h.id);
    return { house_id: h.id, name: h.name, billed: iv?.billed ?? 0, paid: iv?.paid ?? 0, rooms: r?.rooms ?? 0, occupied: r?.occupied ?? 0, profit: reports[i].months.find((x) => x.month === month)?.profit ?? null };
  });
  const billed = rows.reduce((a, r) => a + r.billed, 0), paid = rows.reduce((a, r) => a + r.paid, 0);
  const totalRooms = rows.reduce((a, r) => a + r.rooms, 0), occ = rows.reduce((a, r) => a + r.occupied, 0);
  const profit = rows.reduce((a, r) => a + (r.profit ?? 0), 0);
  const now = Date.now();
  const overdueTotal = al.overdue.reduce((a, o) => a + o.amount, 0);
  // Dữ liệu biểu đồ: đủ 6 tháng, tháng chưa có số liệu để 0
  const bars: { label: string; billed: number; paid: number; profit: number }[] = [];
  {
    let m = from;
    for (let k = 0; k < 6; k++) {
      const s = series.find((x) => x.month === m);
      const pf = reports.reduce((a, r) => a + (r.months.find((x) => x.month === m)?.profit ?? 0), 0);
      bars.push({ label: `T${m.slice(5)}`, billed: s?.billed ?? 0, paid: s?.paid ?? 0, profit: pf });
      m = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 7);
    }
  }
  const rate = billed > 0 ? Math.round((paid / billed) * 100) : 0;
  const occRate = totalRooms > 0 ? Math.round((occ / totalRooms) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tổng quan các nhà · tháng {monthLabel(month)}</h1>
      </div>

      <TodoCard houseName={cur.name} todos={todos} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card c="blue" icon="wallet" label="Phải thu" value={vnd(billed)} sub={`Đã thu ${vnd(paid)}`} />
        <Card c="rose" icon="alert" label="Còn nợ" value={vnd(billed - paid)} tone={billed - paid > 0 ? "text-red-700" : undefined} sub={overdueTotal ? `${vnd(overdueTotal)} đã quá hạn` : "Không có nợ quá hạn"} />
        <Card c="teal" icon="door" label="Phòng đang thuê" value={`${occ}/${totalRooms}`} sub={`Lấp đầy ${occRate}%`} bar={occRate} />
        <Card c="violet" icon="chart" label="Lợi nhuận" value={vnd(profit)} tone={profit < 0 ? "text-red-700" : "text-green-700"} sub={`Thu được ${rate}% số phải thu`} bar={rate} />
      </div>

      <section className={cardCls}>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Thu tiền 6 tháng gần nhất</h2>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-300" />Phải thu</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-500" />Đã thu</span>
          </div>
        </div>
        <BarChart bars={bars} />
      </section>

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

const ICON: Record<string, string> = {
  wallet: "M3 7a2 2 0 0 1 2-2h13v3M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zm13 6h2",
  alert: "M12 4 3 20h18L12 4zm0 6v5m0 3h.01",
  door: "M6 20V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15M4 20h16m-5-8h.01",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
};
const ICON_BG = { blue: "bg-sky-100 text-sky-700", teal: "bg-teal-100 text-teal-700", violet: "bg-violet-100 text-violet-700", amber: "bg-amber-100 text-amber-700", rose: "bg-rose-100 text-rose-700" } as const;
const BAR_BG = { blue: "bg-sky-400", teal: "bg-teal-400", violet: "bg-violet-400", amber: "bg-amber-400", rose: "bg-rose-400" } as const;

function Card({ label, value, tone, c, icon, sub, bar }: { label: string; value: string; tone?: string; c?: keyof typeof accent; icon?: string; sub?: string; bar?: number }) {
  const k = c ?? "blue";
  return (
    <div className={`${cardCls} ${accent[k]}`}>
      <div className="flex items-center gap-2">
        {icon && (
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_BG[k]}`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[icon]} /></svg>
          </span>
        )}
        <div className="text-xs font-medium text-gray-500">{label}</div>
      </div>
      <div className={`mt-2 text-lg font-extrabold tracking-tight sm:text-xl ${tone ?? ""}`}>{value}</div>
      {bar !== undefined && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${BAR_BG[k]}`} style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} /></div>}
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

/** Biểu đồ cột đơn giản (SVG), không dùng thư viện: mỗi tháng 2 cột Phải thu / Đã thu. */
function BarChart({ bars }: { bars: { label: string; billed: number; paid: number; profit: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => Math.max(b.billed, b.paid)));
  const W = 600, H = 180, pad = 24, gw = (W - pad * 2) / bars.length;
  const short = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} tỷ` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} tr` : n > 0 ? `${Math.round(n / 1e3)}k` : "");
  if (bars.every((b) => b.billed === 0)) return <p className="py-6 text-center text-sm text-gray-500">Chưa có hóa đơn trong 6 tháng này.</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} className="w-full" role="img" aria-label="Biểu đồ phải thu và đã thu theo tháng">
      {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1={pad} x2={W - pad} y1={H - H * 0.88 * t} y2={H - H * 0.88 * t} stroke="#e7e5e4" strokeDasharray="3 4" />)}
      <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#d6d3d1" />
      {bars.map((b, i) => {
        const x = pad + i * gw, bw = Math.min(34, gw / 2 - 6);
        const hb = (b.billed / max) * H * 0.88, hp = (b.paid / max) * H * 0.88;
        return (
          <g key={i}>
            <title>{`${b.label}: phải thu ${vnd(b.billed)}, đã thu ${vnd(b.paid)}`}</title>
            <rect x={x + gw / 2 - bw - 2} y={H - hb} width={bw} height={hb} rx={4} fill="#8ec3f7" />
            <rect x={x + gw / 2 + 2} y={H - hp} width={bw} height={hp} rx={4} fill="#14b8a6" />
            <text x={x + gw / 2 - bw / 2 - 2} y={H - hb - 5} textAnchor="middle" fontSize="11" fill="#57534e">{short(b.billed)}</text>
            <text x={x + gw / 2 + bw / 2 + 2} y={H - hp - 5} textAnchor="middle" fontSize="11" fill="#0f766e">{short(b.paid)}</text>
            <text x={x + gw / 2} y={H + 18} textAnchor="middle" fontSize="12" fill="#78716c">{b.label}</text>
          </g>
        );
      })}
    </svg>
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
