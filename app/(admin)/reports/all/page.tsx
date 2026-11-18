import Link from "next/link";
import { listHouses } from "@/lib/db";
import { selectedMonth } from "@/lib/month";
import { dateVN, monthLabel, vnd } from "@/lib/format";
import { loadMgmt, type HouseRow, type Mgmt } from "@/lib/mgmt";
import { PrintButton } from "../../../print-button";
import { accent, cardCls, tdCls, thCls } from "@/lib/ui";

const VIEWS = [["summary", "Tổng hợp các nhà"], ["meters", "Chỉ số điện nước"], ["pnl", "Lãi lỗ"], ["cash", "Dòng tiền"], ["plan", "Kế hoạch tháng mới"]] as const;
type View = (typeof VIEWS)[number][0];
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "-");
const delta = (now: number, before: number | null) => {
  if (before === null || before === 0) return <span className="text-gray-400">-</span>;
  const d = ((now - before) / before) * 100;
  const cls = Math.abs(d) < 10 ? "text-gray-500" : d > 0 ? "text-amber-700" : "text-teal-700";
  return <span className={cls}>{d > 0 ? "+" : ""}{Math.round(d)}%</span>;
};
const N = (v: number) => (Math.round(v * 10) / 10).toLocaleString("vi-VN");

/** Báo cáo quản trị nhiều nhà: tổng hợp, chỉ số điện nước, lãi lỗ, dòng tiền, kế hoạch tháng mới. Theo tháng chọn ở thanh trên. */
export default async function ManagementPage({ searchParams }: { searchParams: Promise<{ v?: string; house?: string }> }) {
  const sp = await searchParams;
  const view: View = VIEWS.some((x) => x[0] === sp.v) ? (sp.v as View) : "summary";
  const houseId = sp.house && /^\d+$/.test(sp.house) ? Number(sp.house) : null;
  const month = await selectedMonth();
  const [houses, m] = await Promise.all([listHouses(), loadMgmt(month, houseId)]);
  const href = (v: string, h: number | null = houseId) => `/reports/all?v=${v}${h ? `&house=${h}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Báo cáo quản trị · tháng {monthLabel(month)}</h1>
          <p className="text-sm text-gray-600">{houseId ? houses.find((h) => h.id === houseId)?.name : `Tất cả ${houses.length} nhà`} · đổi tháng ở ô chọn tháng trên cùng</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <form action="/reports/all" className="flex items-center gap-2">
            <input type="hidden" name="v" value={view} />
            <select name="house" defaultValue={houseId ?? ""} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm">
              <option value="">Tất cả các nhà</option>
              {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Xem</button>
          </form>
          <PrintButton label="In / Lưu PDF" />
          <Link href="/reports" className="text-sm text-brand-700 hover:underline">← Báo cáo từng nhà</Link>
        </div>
      </div>

      <nav className="no-print flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-200">
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={href(k)} className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-center text-sm font-medium ${view === k ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-brand-50"}`}>{l}</Link>
        ))}
      </nav>

      {view === "summary" && <Summary m={m} />}
      {view === "meters" && <Meters m={m} />}
      {view === "pnl" && <Pnl m={m} />}
      {view === "cash" && <Cash m={m} />}
      {view === "plan" && <Plan m={m} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone, c }: { label: string; value: string; sub?: string; tone?: string; c: keyof typeof accent }) {
  return <div className={`${cardCls} ${accent[c]}`}><div className="text-xs font-medium text-gray-500">{label}</div><div className={`mt-1 text-lg font-extrabold tabular-nums ${tone ?? ""}`}>{value}</div>{sub && <div className="text-xs text-gray-500">{sub}</div>}</div>;
}

function Summary({ m }: { m: Mgmt }) {
  const t = m.total;
  const top = Math.max(1, ...m.trend.map((x) => Math.max(x.revenue, x.cost, Math.abs(x.profit))));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi c="blue" label="Phải thu" value={vnd(t.billed)} sub={`Đã thu ${vnd(t.paid)} (${pct(t.paid, t.billed)})`} />
        <Kpi c="rose" label="Còn nợ" value={vnd(t.debt)} tone={t.debt > 0 ? "text-red-700" : ""} sub={t.overdue ? `${vnd(t.overdue)} quá hạn` : "Không có nợ quá hạn"} />
        <Kpi c="teal" label="Lấp đầy" value={`${t.occupied}/${t.rooms}`} sub={pct(t.occupied, t.rooms)} />
        <Kpi c="violet" label="Lợi nhuận" value={vnd(t.profit)} tone={t.profit < 0 ? "text-red-700" : "text-green-700"} sub={`Doanh thu ${vnd(t.revenue)}`} />
      </div>
      <section className={`${cardCls} overflow-x-auto`}>
        <table className="w-full min-w-[56rem]">
          <thead><tr><th className={thCls}>Nhà</th><th className={thCls}>Phòng thuê</th><th className={`${thCls} text-right`}>Phải thu</th><th className={`${thCls} text-right`}>Đã thu</th><th className={`${thCls} text-right`}>Tỷ lệ thu</th><th className={`${thCls} text-right`}>Còn nợ</th><th className={`${thCls} text-right`}>Quá hạn</th><th className={`${thCls} text-right`}>Tổng chi</th><th className={`${thCls} text-right`}>Lợi nhuận</th><th className={`${thCls} text-right`}>So tháng trước</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {m.houses.map((r) => <SumRow key={r.id} r={r} />)}
            <SumRow r={t} total />
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">Lợi nhuận chỉ tính khi tháng đó có hóa đơn hoặc sổ thu chi. &quot;So tháng trước&quot; là chênh lệch lợi nhuận.</p>
      </section>
      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">Xu hướng 6 tháng (tất cả nhà đang chọn)</h2>
        <div className="flex h-44 items-end gap-3 overflow-x-auto">
          {m.trend.map((x) => (
            <div key={x.month} className="flex min-w-[3rem] flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel(x.month)}: thu ${vnd(x.revenue)}, chi ${vnd(x.cost)}, lãi ${vnd(x.profit)}`}>
              <div className="flex h-36 items-end gap-0.5">
                <div className="w-3 rounded-t bg-sky-400" style={{ height: `${Math.max(2, (x.revenue / top) * 136)}px` }} />
                <div className="w-3 rounded-t bg-amber-400" style={{ height: `${Math.max(2, (x.cost / top) * 136)}px` }} />
                <div className={`w-3 rounded-t ${x.profit < 0 ? "bg-rose-400" : "bg-teal-400"}`} style={{ height: `${Math.max(2, (Math.abs(x.profit) / top) * 136)}px` }} />
              </div>
              <span className="text-[10px] text-gray-500">T{x.month.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-gray-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" />Doanh thu</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />Chi</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-teal-400" />Lãi</span></div>
      </section>
    </>
  );
}
function SumRow({ r, total }: { r: HouseRow; total?: boolean }) {
  const prevProfit = r.prev?.profit ?? null;
  return (
    <tr className={total ? "bg-brand-50 font-extrabold" : ""}>
      <td className={`${tdCls} font-medium`}>{r.name}</td>
      <td className={tdCls}>{r.rooms ? `${r.occupied}/${r.rooms} (${pct(r.occupied, r.rooms)})` : <span className="text-gray-400">chưa có phòng</span>}</td>
      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums`}>{r.billed ? vnd(r.billed) : "-"}</td>
      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums`}>{r.billed ? vnd(r.paid) : "-"}</td>
      <td className={`${tdCls} text-right`}>{pct(r.paid, r.billed)}</td>
      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums ${r.debt > 0 ? "text-red-700" : ""}`}>{r.billed ? vnd(r.debt) : "-"}</td>
      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums ${r.overdue > 0 ? "font-semibold text-red-700" : ""}`}>{r.overdue ? vnd(r.overdue) : "-"}</td>
      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums`}>{r.cost ? vnd(r.cost) : "-"}</td>
      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums ${r.profit < 0 ? "text-red-700" : "text-green-700"}`}>{r.rep || total ? vnd(r.profit) : "-"}</td>
      <td className={`${tdCls} text-right`}>{total ? "" : prevProfit === null ? <span className="text-gray-400">-</span> : <span className={r.profit - prevProfit >= 0 ? "text-teal-700" : "text-red-700"}>{r.profit - prevProfit >= 0 ? "+" : ""}{vnd(r.profit - prevProfit)}</span>}</td>
    </tr>
  );
}

function Meters({ m }: { m: Mgmt }) {
  const byHouse = new Map<string, typeof m.meters>();
  for (const r of m.meters) byHouse.set(r.house, [...(byHouse.get(r.house) ?? []), r]);
  const sum = (a: typeof m.meters, f: (r: (typeof m.meters)[number]) => number) => a.reduce((t, r) => t + f(r), 0);
  const prevSum = (a: typeof m.meters, f: (r: (typeof m.meters)[number]) => number | null) => a.some((r) => f(r) !== null) ? a.reduce((t, r) => t + (f(r) ?? 0), 0) : null;
  if (m.meters.length === 0) return <section className={cardCls}><p className="text-sm text-gray-600">Tháng này chưa có chỉ số điện nước nào. Nhập số mới ở trang Hóa đơn tháng.</p></section>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi c="amber" label="Điện tiêu thụ" value={`${N(sum(m.meters, (r) => r.eUse))} kWh`} sub={`${m.meters.length} phòng có chỉ số`} />
        <Kpi c="blue" label="Nước tiêu thụ" value={`${N(sum(m.meters, (r) => r.wUse))} m³`} />
        <Kpi c="teal" label="Điện bình quân/phòng" value={`${N(sum(m.meters, (r) => r.eUse) / m.meters.length)} kWh`} />
        <Kpi c="violet" label="Phòng điện tăng bất thường" value={String(m.plan.jumps.length)} tone={m.plan.jumps.length ? "text-amber-700" : ""} sub="tăng hơn 50% so với tháng trước" />
      </div>
      {[...byHouse.entries()].map(([house, list]) => (
        <section key={house} className={`${cardCls} overflow-x-auto`}>
          <h2 className="mb-2 font-semibold">{house}</h2>
          <table className="w-full min-w-[44rem]">
            <thead><tr><th className={thCls}>Phòng</th><th className={`${thCls} text-right`}>Điện cũ</th><th className={`${thCls} text-right`}>Điện mới</th><th className={`${thCls} text-right`}>Dùng (kWh)</th><th className={`${thCls} text-right`}>Tháng trước</th><th className={`${thCls} text-right`}>±</th><th className={`${thCls} text-right`}>Nước cũ</th><th className={`${thCls} text-right`}>Nước mới</th><th className={`${thCls} text-right`}>Dùng (m³)</th><th className={`${thCls} text-right`}>±</th></tr></thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {list.map((r) => (
                <tr key={r.code}>
                  <td className={`${tdCls} font-medium`}>{r.code}</td>
                  <td className={`${tdCls} text-right text-gray-500`}>{N(r.eOld)}</td><td className={`${tdCls} text-right text-gray-500`}>{N(r.eNew)}</td>
                  <td className={`${tdCls} text-right font-semibold text-amber-800`}>{N(r.eUse)}</td><td className={`${tdCls} text-right text-gray-500`}>{r.ePrev === null ? "-" : N(r.ePrev)}</td><td className={`${tdCls} text-right`}>{delta(r.eUse, r.ePrev)}</td>
                  <td className={`${tdCls} text-right text-gray-500`}>{N(r.wOld)}</td><td className={`${tdCls} text-right text-gray-500`}>{N(r.wNew)}</td>
                  <td className={`${tdCls} text-right font-semibold text-sky-800`}>{N(r.wUse)}</td><td className={`${tdCls} text-right`}>{delta(r.wUse, r.wPrev)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className={tdCls}>Tổng nhà</td><td className={tdCls} colSpan={2} />
                <td className={`${tdCls} text-right text-amber-800`}>{N(sum(list, (r) => r.eUse))}</td><td className={`${tdCls} text-right`}>{prevSum(list, (r) => r.ePrev) === null ? "-" : N(prevSum(list, (r) => r.ePrev)!)}</td><td className={`${tdCls} text-right`}>{delta(sum(list, (r) => r.eUse), prevSum(list, (r) => r.ePrev))}</td>
                <td className={tdCls} colSpan={2} />
                <td className={`${tdCls} text-right text-sky-800`}>{N(sum(list, (r) => r.wUse))}</td><td className={`${tdCls} text-right`}>{delta(sum(list, (r) => r.wUse), prevSum(list, (r) => r.wPrev))}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

function Pnl({ m }: { m: Mgmt }) {
  const cols = [...m.houses, m.total];
  const val = (r: HouseRow, f: (x: NonNullable<HouseRow["rep"]>) => number) => (r.id === 0 ? m.houses.reduce((t, h) => t + (h.rep ? f(h.rep) : 0), 0) : r.rep ? f(r.rep) : 0);
  const lines: { label: string; f: (x: NonNullable<HouseRow["rep"]>) => number; neg?: boolean; strong?: boolean; sep?: boolean }[] = [
    { label: "Doanh thu hóa đơn phòng", f: (x) => x.billed },
    { label: "Thu phòng mới (cọc, tháng đầu)", f: (x) => x.other_income },
    { label: "TỔNG DOANH THU", f: (x) => x.revenue, strong: true },
    { label: "Chi: tiền điện trả nhà cung cấp", f: (x) => x.chi.dien, neg: true },
    { label: "Chi: tiền nước", f: (x) => x.chi.nuoc, neg: true },
    { label: "Chi: mạng", f: (x) => x.chi.mang, neg: true },
    { label: "Chi: dịch vụ", f: (x) => x.chi.dich_vu, neg: true },
    { label: "Chi: thuê nhà trả chủ", f: (x) => x.chi.tien_phong, neg: true },
    { label: "Chi: phát sinh", f: (x) => x.chi.phat_sinh, neg: true },
    { label: "Chi: lương quản lý", f: (x) => x.salary, neg: true },
    { label: "TỔNG CHI", f: (x) => x.total_cost, strong: true, neg: true },
    { label: "LỢI NHUẬN", f: (x) => x.profit, strong: true },
  ];
  return (
    <section className={`${cardCls} overflow-x-auto`}>
      <h2 className="mb-2 font-semibold">Báo cáo lãi lỗ tháng {monthLabel(m.month)}</h2>
      <table className="w-full min-w-[40rem]">
        <thead><tr><th className={thCls}>Khoản</th>{cols.map((c) => <th key={c.id} className={`${thCls} text-right`}>{c.id === 0 ? "TỔNG" : c.name}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100 tabular-nums">
          {lines.map((l) => (
            <tr key={l.label} className={l.strong ? "bg-brand-50 font-bold" : ""}>
              <td className={tdCls}>{l.label}</td>
              {cols.map((c) => { const v = val(c, l.f); return <td key={c.id} className={`${tdCls} text-right ${l.label === "LỢI NHUẬN" ? (v < 0 ? "text-red-700" : "text-green-700") : ""}`}>{v ? (l.neg ? `-${vnd(v)}` : vnd(v)) : "-"}</td>; })}
            </tr>
          ))}
          <tr><td className={tdCls}>Biên lợi nhuận</td>{cols.map((c) => { const rev = val(c, (x) => x.revenue), pf = val(c, (x) => x.profit); return <td key={c.id} className={`${tdCls} text-right`}>{rev > 0 ? `${Math.round((pf / rev) * 100)}%` : "-"}</td>; })}</tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">Chi phí lấy từ sổ thu chi và ô &quot;Tổng chi&quot; ở trang Hóa đơn tháng. Tiền thuê nhà tính theo mức quy ra mỗi tháng trong Cài đặt nếu có. Vốn đầu tư không tính vào lãi lỗ tháng.</p>
    </section>
  );
}

function Cash({ m }: { m: Mgmt }) {
  const rows = m.cash.rows;
  let run = 0;
  const cum = rows.map((r) => (run += r.net));
  return (
    <section className={`${cardCls} overflow-x-auto`}>
      <h2 className="mb-1 font-semibold">Dòng tiền 6 tháng gần nhất</h2>
      <p className="mb-3 text-xs text-gray-500">Tiền vào = tiền khách thực nộp trong tháng (theo ngày thu) + thu phòng mới. Tiền ra = tổng chi phí tháng + vốn đầu tư. Khác với lãi lỗ: dòng tiền tính theo ngày tiền thật vào/ra.</p>
      <table className="w-full min-w-[36rem]">
        <thead><tr><th className={thCls}>Tháng</th><th className={`${thCls} text-right`}>Thu tiền hóa đơn</th><th className={`${thCls} text-right`}>Thu phòng mới</th><th className={`${thCls} text-right`}>Tiền ra</th><th className={`${thCls} text-right`}>Dòng tiền ròng</th><th className={`${thCls} text-right`}>Lũy kế</th></tr></thead>
        <tbody className="divide-y divide-gray-100 tabular-nums">
          {rows.map((r, i) => (
            <tr key={r.month} className={r.month === m.month ? "bg-brand-50" : ""}>
              <td className={`${tdCls} font-medium`}>{monthLabel(r.month)}</td>
              <td className={`${tdCls} text-right`}>{r.inflow ? vnd(r.inflow) : "-"}</td>
              <td className={`${tdCls} text-right`}>{r.other ? vnd(r.other) : "-"}</td>
              <td className={`${tdCls} text-right`}>{r.outflow ? `-${vnd(r.outflow)}` : "-"}</td>
              <td className={`${tdCls} text-right font-semibold ${r.net < 0 ? "text-red-700" : "text-green-700"}`}>{vnd(r.net)}</td>
              <td className={`${tdCls} text-right ${cum[i] < 0 ? "text-red-700" : ""}`}>{vnd(cum[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Plan({ m }: { m: Mgmt }) {
  const p = m.plan;
  const items: { tone: "red" | "amber" | "sky"; title: string; detail: string; href: string }[] = [];
  if (p.overdueCount) items.push({ tone: "red", title: `Thu ${p.overdueCount} phòng nợ quá hạn: ${vnd(p.overdueTotal)}`, detail: "Nhắc qua Zalo ngay đầu tháng, ưu tiên phòng trễ lâu nhất.", href: "/overview" });
  if (p.expiring.length) items.push({ tone: "amber", title: `${p.expiring.length} hợp đồng hết hạn trong 30 ngày tới`, detail: p.expiring.slice(0, 6).map((e) => `${e.house} P.${e.code} (${dateVN(e.end)})`).join("; ") + (p.expiring.length > 6 ? "…" : "") + ". Hỏi khách có gia hạn không, chuẩn bị đăng tìm khách nếu trả phòng.", href: "/tenants" });
  if (p.vacant.length) items.push({ tone: "amber", title: `${p.vacant.length} phòng trống, mất khoảng ${vnd(p.vacantLoss)}/tháng`, detail: p.vacant.slice(0, 8).map((v) => `${v.house} P.${v.code}`).join("; ") + (p.vacant.length > 8 ? "…" : "") + ". Đăng tin cho thuê, cân nhắc giảm giá nhẹ nếu trống lâu.", href: "/rooms" });
  if (p.missingReadings.length) items.push({ tone: "amber", title: `${p.missingReadings.length} phòng chưa có hóa đơn tháng ${monthLabel(m.month)}`, detail: p.missingReadings.slice(0, 8).map((v) => `${v.house} P.${v.code}`).join("; ") + (p.missingReadings.length > 8 ? "…" : "") + ". Nhập chỉ số điện nước để tạo hóa đơn.", href: "/" });
  if (p.jumps.length) items.push({ tone: "amber", title: `${p.jumps.length} phòng điện tăng bất thường`, detail: p.jumps.slice(0, 6).map((j) => `${j.house} P.${j.code}: ${N(j.now)} kWh (trước ${N(j.prev)})`).join("; ") + ". Kiểm tra lại số công tơ hoặc thiết bị.", href: "/reports/all?v=meters" });
  if (p.openIssues) items.push({ tone: "sky", title: `${p.openIssues} sự cố chưa xử lý`, detail: "Xử lý trước khi sang tháng để tránh khách phản ánh khi thu tiền.", href: "/issues" });
  const tone = { red: "border-l-rose-500 bg-rose-50", amber: "border-l-amber-500 bg-amber-50", sky: "border-l-sky-500 bg-sky-50" } as const;
  return (
    <>
      <section className={cardCls}>
        <h2 className="mb-1 font-semibold">Dự kiến tháng {monthLabel(p.next)}</h2>
        <p className="mb-3 text-xs text-gray-500">Lấy trung bình 3 tháng gần nhất làm cơ sở. Đây là ước tính để lên kế hoạch, không phải số chốt.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi c="blue" label="Doanh thu dự kiến" value={vnd(p.expRevenue)} />
          <Kpi c="amber" label="Chi phí dự kiến" value={vnd(p.expCost)} sub={`Gồm thuê nhà ${vnd(p.fixedRent)}${p.salary ? `, lương ${vnd(p.salary)}` : ""}`} />
          <Kpi c="violet" label="Lợi nhuận dự kiến" value={vnd(p.expProfit)} tone={p.expProfit < 0 ? "text-red-700" : "text-green-700"} />
          <Kpi c="rose" label="Rủi ro mất doanh thu" value={vnd(p.vacantLoss)} sub={`${p.vacant.length} phòng trống + ${p.expiring.length} hợp đồng sắp hết`} />
        </div>
      </section>
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Việc cần làm để vào tháng mới suôn sẻ</h2>
        {items.length === 0 ? <p className="text-sm text-gray-600">Không có việc tồn đọng. Mọi thứ đang ổn.</p> : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.title} className={`rounded-lg border-l-4 px-3 py-2 ${tone[it.tone]}`}>
                <Link href={it.href} className="font-semibold text-gray-900 hover:underline">{it.title}</Link>
                <div className="text-sm text-gray-700">{it.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
