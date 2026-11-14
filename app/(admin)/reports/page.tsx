import Link from "next/link";
import { currentHouse } from "@/lib/house";
import { currentMonth, vnd } from "@/lib/format";
import { houseReport } from "@/lib/report";
import { accent, cardCls, tdCls, thCls } from "@/lib/ui";

const CAT: Record<string, string> = { dien: "Tiền điện (trả nhà cung cấp)", nuoc: "Tiền nước", mang: "Mạng", dich_vu: "Dịch vụ", tien_phong: "Thuê nhà trả chủ", phat_sinh: "Chi phí phát sinh" };

/** Báo cáo thu chi, lợi nhuận, chia lãi, hòa vốn và điện nước của nhà đang chọn. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const thisYear = Number(currentMonth().slice(0, 4));
  const year = /^20\d{2}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const { months: all, partners, settings } = await houseReport(house.id, "2000-01", "2100-12");
  const months = all.filter((m) => m.month.startsWith(`${year}-`));
  const sum = (f: (m: (typeof all)[number]) => number, list = months) => list.reduce((a, m) => a + f(m), 0);
  const revenue = sum((m) => m.revenue), cost = sum((m) => m.total_cost), profit = sum((m) => m.profit), paid = sum((m) => m.paid), billed = sum((m) => m.billed);
  const invest = sum((m) => m.invest, all);
  const profitAll = sum((m) => m.profit, all);
  const hasData = all.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Báo cáo thu chi {year}</h1>
          <p className="text-sm text-gray-600">{house.name}</p>
        </div>
        <div className="flex gap-2">
          {[2025, 2026, 2027].map((y) => (
            <Link key={y} href={`/reports?year=${y}`} className={`rounded-md border px-3 py-1.5 text-sm ${y === year ? "border-brand-700 bg-brand-700 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"}`}>{y}</Link>
          ))}
        </div>
      </div>

      {!hasData ? (
        <section className={cardCls}><p className="text-sm text-gray-600">Nhà này chưa có số liệu. Hãy nhập dữ liệu cũ (Khác → Nhập dữ liệu sheet) hoặc tạo hóa đơn tháng.</p></section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card c="blue" label="Doanh thu" value={vnd(revenue)} />
            <Card c="amber" label="Tổng chi" value={vnd(cost)} />
            <Card c="violet" label="Lợi nhuận (sau chi, lương)" value={vnd(profit)} tone={profit < 0 ? "text-red-700" : "text-green-700"} />
            <Card c="teal" label="Tỷ lệ đã thu" value={billed ? `${Math.round((paid / billed) * 100)}%` : "-"} />
          </div>

          <section className={cardCls}>
            <h2 className="mb-3 font-semibold">Thu, chi, lãi {year}</h2>
            {months.length === 0 ? <p className="text-sm text-gray-500">Chưa có số liệu.</p> : (() => {
              const top = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.total_cost, Math.abs(m.profit))));
              return (
                <>
                  <div className="flex h-44 items-end gap-2 overflow-x-auto pb-1">
                    {months.map((m) => (
                      <div key={m.month} className="flex min-w-[2.6rem] flex-1 flex-col items-center justify-end gap-1" title={`T${m.month.slice(5)}: thu ${vnd(m.revenue)}, chi ${vnd(m.total_cost)}, lãi ${vnd(m.profit)}`}>
                        <div className="flex h-36 items-end gap-0.5">
                          <div className="w-2.5 rounded-t bg-sky-400" style={{ height: `${Math.max(2, (m.revenue / top) * 136)}px` }} />
                          <div className="w-2.5 rounded-t bg-amber-400" style={{ height: `${Math.max(2, (m.total_cost / top) * 136)}px` }} />
                          <div className={`w-2.5 rounded-t ${m.profit < 0 ? "bg-rose-400" : "bg-teal-400"}`} style={{ height: `${Math.max(2, (Math.abs(m.profit) / top) * 136)}px` }} />
                        </div>
                        <span className="text-[10px] text-gray-500">T{m.month.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-gray-600">
                    <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" />Doanh thu</span>
                    <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />Chi</span>
                    <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-teal-400" />Lãi</span>
                  </div>
                </>
              );
            })()}
          </section>

          {partners.length > 0 && (
            <section className={cardCls}>
              <h2 className="mb-2 font-semibold">Chia lãi năm {year}</h2>
              <div className="flex flex-wrap gap-6 text-sm">
                {partners.map((p) => (
                  <div key={p.name}><span className="text-gray-600">{p.name} ({p.pct}%)</span><div className="text-lg font-bold">{vnd((profit * p.pct) / 100)}</div></div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">Tính trên lợi nhuận sau khi trừ chi phí, tiền thuê nhà (chia đều theo tháng) và lương quản lý.</p>
            </section>
          )}

          {invest > 0 && (
            <section className={cardCls}>
              <h2 className="mb-2 font-semibold">Vốn đầu tư và hòa vốn (toàn thời gian)</h2>
              <div className="flex flex-wrap gap-6 text-sm">
                <div><span className="text-gray-600">Vốn đã bỏ ra</span><div className="text-lg font-bold">{vnd(invest)}</div></div>
                <div><span className="text-gray-600">Lãi lũy kế</span><div className="text-lg font-bold">{vnd(profitAll)}</div></div>
                <div><span className="text-gray-600">{profitAll >= invest ? "Đã hòa vốn, lãi sau vốn" : "Còn thiếu để hòa vốn"}</span><div className={`text-lg font-bold ${profitAll >= invest ? "text-green-700" : "text-red-700"}`}>{vnd(Math.abs(profitAll - invest))}</div></div>
              </div>
              <p className="mt-2 text-xs text-gray-500">Lãi lũy kế tính từ tháng đầu có số liệu, chưa trừ vốn. Cách tính này có thể lệch nhẹ so với sheet &quot;Chốt&quot; của anh.</p>
            </section>
          )}

          <section className={`${cardCls} overflow-x-auto`}>
            <h2 className="mb-2 font-semibold">Từng tháng (bấm để xem chi tiết)</h2>
            <div className="divide-y divide-gray-100">
              {months.map((m) => (
                <details key={m.month} className="py-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="w-20 font-semibold">T{m.month.slice(5)}/{m.month.slice(0, 4)}</span>
                    <span>Thu <b>{vnd(m.revenue)}</b></span>
                    <span>Chi <b>{vnd(m.total_cost)}</b></span>
                    <span className={m.profit < 0 ? "text-red-700" : "text-green-700"}>Lãi <b>{vnd(m.profit)}</b></span>
                    {m.invest > 0 && <span className="text-amber-700">Đầu tư {vnd(m.invest)}</span>}
                  </summary>
                  <div className="mt-2 grid gap-4 pl-2 text-sm sm:grid-cols-2">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-100">
                        <tr><td className={tdCls}>Hóa đơn phòng ({m.rooms} phòng)</td><td className={`${tdCls} text-right`}>{vnd(m.billed)}</td></tr>
                        {m.other_income > 0 && <tr><td className={tdCls}>Thu phòng mới (cọc, tháng đầu)</td><td className={`${tdCls} text-right`}>{vnd(m.other_income)}</td></tr>}
                        {(Object.keys(CAT) as (keyof typeof m.chi)[]).map((k) => m.chi[k] ? <tr key={k}><td className={tdCls}>Chi: {CAT[k]}</td><td className={`${tdCls} text-right`}>-{vnd(m.chi[k])}</td></tr> : null)}
                        {m.salary > 0 && <tr><td className={tdCls}>Chi: Lương quản lý</td><td className={`${tdCls} text-right`}>-{vnd(m.salary)}</td></tr>}
                        <tr className="font-semibold"><td className={tdCls}>Lợi nhuận</td><td className={`${tdCls} text-right`}>{vnd(m.profit)}</td></tr>
                        {partners.map((p) => <tr key={p.name}><td className={`${tdCls} text-gray-600`}>→ {p.name} ({p.pct}%)</td><td className={`${tdCls} text-right text-gray-600`}>{vnd((m.profit * p.pct) / 100)}</td></tr>)}
                      </tbody>
                    </table>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Khoản chi phát sinh</p>
                      {m.items.filter((x) => x.category !== "luong").length === 0 ? <p className="text-gray-500">Không có</p> : (
                        <ul className="space-y-1">
                          {m.items.filter((x) => x.category !== "luong").map((x, i) => <li key={i} className="flex justify-between gap-3"><span>{x.name}</span><span>{vnd(x.amount)}</span></li>)}
                        </ul>
                      )}
                      <p className="mt-3 text-xs text-gray-500">Điện {Math.round(m.kwh)} kWh · Nước {Math.round(m.m3)} m³</p>
                    </div>
                  </div>
                </details>
              ))}
              {months.length === 0 && <p className="py-2 text-sm text-gray-600">Năm {year} chưa có số liệu.</p>}
            </div>
          </section>

          <section className={`${cardCls} overflow-x-auto`}>
            <h2 className="mb-2 font-semibold">Điện nước theo tháng {year}</h2>
            <table className="w-full">
              <thead><tr><th className={thCls}>Tháng</th><th className={`${thCls} text-right`}>Điện (kWh)</th><th className={`${thCls} text-right`}>Nước (m³)</th><th className={`${thCls} text-right`}>Điện/phòng</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {months.filter((m) => m.kwh > 0 || m.m3 > 0).map((m) => (
                  <tr key={m.month}>
                    <td className={tdCls}>{m.month.slice(5)}/{m.month.slice(0, 4)}</td>
                    <td className={`${tdCls} text-right`}>{Math.round(m.kwh).toLocaleString("vi-VN")}</td>
                    <td className={`${tdCls} text-right`}>{Math.round(m.m3).toLocaleString("vi-VN")}</td>
                    <td className={`${tdCls} text-right`}>{m.rooms ? Math.round(m.kwh / m.rooms) : "-"} kWh</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">Giá điện đang cài: {vnd(Number(settings.elec_price) || 0)}/kWh.</p>
          </section>
        </>
      )}
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
