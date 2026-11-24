"use client";

import { useEffect, useState } from "react";
import { StatusText, useAutosave } from "./use-autosave";
import { pinExpense, saveChiCategories, saveExpenseItems, saveLandlordExtras, saveLandlordSettings, saveNewRooms, unpinExpense } from "./actions";
import { useRouter } from "next/navigation";
import { vnd } from "@/lib/format";
import type { LedgerMonth } from "@/lib/ledgermonth";

const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const th = "border-b border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold uppercase text-gray-600";
const td = "border-b border-gray-100 px-2 py-1.5 align-middle";
const num = (s: string) => { const n = Number(String(s).trim().replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Ô nhập tiền: hiện dấu chấm ngăn nghìn và đơn vị "đ" (giống cột Tổng thu), bên trong vẫn lưu dạng số thường. */
function MoneyInput({ value, onChange, placeholder, allowNegative }: { value: string; onChange: (v: string) => void; placeholder?: string; allowNegative?: boolean }) {
  // allowNegative: gõ dấu "-" ở đầu để nhập số âm (hoàn tiền, được trừ). Bên trong lưu "-500000".
  const split = (s: string) => ({ neg: !!allowNegative && s.trim().startsWith("-"), digits: s.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "") });
  const { neg, digits } = split(value);
  const shown = (neg ? "-" : "") + (digits ? Number(digits).toLocaleString("vi-VN") : "");
  return (
    <div className="relative">
      <input inputMode={allowNegative ? "text" : "numeric"} value={shown} placeholder={placeholder ?? "0"} onChange={(e) => { const r = split(e.target.value); onChange((r.neg ? "-" : "") + r.digits); }} className={`${inp} pr-6 text-right`} />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-500">đ</span>
    </div>
  );
}

type Exp = { name: string; qty: string; unit: string; note: string };
type NR = { room: string; rent: string; people: string; phone: string; total: string; note: string };
export type RoomCost = { id: number; code: string; tenant: string; elec: number; water: number; svc: number };
export type LiveThu = { dien: number; nuoc: number; mang: number; dich_vu: number; tien_phong: number; phat_sinh: number };


/** Ba bảng dưới bảng hóa đơn (giống cuối tab sheet): Chi phí phát sinh, Thu tiền phòng mới, Chi tiết lợi nhuận. */
export function MonthExtras({ month, thu, ledger, roomCosts }: { month: string; thu: LiveThu; ledger: LedgerMonth; roomCosts: RoomCost[] }) {
  const router = useRouter();
  const [ll, setLl] = useState({ enabled: ledger.landlord.enabled, elecRoomIds: ledger.landlord.elecRoomIds, waterRoomIds: ledger.landlord.waterRoomIds, name: ledger.landlord.name });
  const [llToken, setLlToken] = useState(ledger.landlord.token);
  const [llExtras, setLlExtras] = useState<{ name: string; amount: string }[]>(ledger.landlord.extras);
  async function saveLl(next: typeof ll) {
    setLl(next);
    const r = await saveLandlordSettings(next);
    if (r.ok && r.token) setLlToken(r.token);
    if (!r.ok) setMsg((p) => ({ ...p, ll: r.error ?? "Chưa lưu được" }));
    else if (next.enabled !== ledger.landlord.enabled) router.refresh();
  }
  const [items, setItems] = useState<Exp[]>(ledger.items.map((i) => ({ name: i.name, qty: String(i.qty), unit: String(i.unit), note: i.note })));
  const [rooms, setRooms] = useState<NR[]>(ledger.newRooms.map((r) => ({ room: r.room, rent: String(r.rent), people: String(r.people), phone: r.phone, total: String(r.total), note: r.note })));
  const [chi, setChi] = useState<Record<string, string>>({
    dien: ledger.chi.dien ? String(ledger.chi.dien) : "", nuoc: ledger.chi.nuoc ? String(ledger.chi.nuoc) : "", mang: ledger.chi.mang ? String(ledger.chi.mang) : "",
    dich_vu: ledger.chi.dich_vu ? String(ledger.chi.dich_vu) : "", tien_phong: ledger.chi.tien_phong ? String(ledger.chi.tien_phong) : "",
  });
  const [pins, setPins] = useState<string[]>(ledger.pins);
  const [msg, setMsg] = useState<Record<string, string>>({});
  async function togglePin(it: Exp) {
    const name = it.name.trim();
    if (!name) { setMsg((p) => ({ ...p, exp: "Nhập tên khoản trước khi ghim" })); return; }
    if (pins.includes(name)) {
      const r = await unpinExpense(name);
      if (r.ok) { setPins(pins.filter((x) => x !== name)); setMsg((p) => ({ ...p, exp: `Đã bỏ ghim "${name}"` })); }
    } else {
      const r = await pinExpense(month, it);
      if (r.ok) { setPins([...pins, name]); setMsg((p) => ({ ...p, exp: `Đã ghim "${name}": tự có ở các tháng sau` })); }
      else setMsg((p) => ({ ...p, exp: r.error ?? "Không ghim được" }));
    }
  }
  const setM = (k: string) => (t: string) => setMsg((p) => ({ ...p, [k]: t }));
  const fixedRent = ledger.rentMonthly > 0;
  const exp = useAutosave(items, (v) => saveExpenseItems(month, v), setM("exp"));
  const nr = useAutosave(rooms, (v) => saveNewRooms(month, v), setM("new"));
  const lx = useAutosave(llExtras, (v) => saveLandlordExtras(month, v), setM("ll"));
  const cs = useAutosave(chi, (v) => saveChiCategories(month, fixedRent ? { dien: v.dien, nuoc: v.nuoc, mang: v.mang, dich_vu: v.dich_vu } : v), setM("chi"));
  // Đóng tab hoặc tải lại trang khi còn phần chưa lưu: trình duyệt hỏi lại
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (exp.dirty() || nr.dirty() || cs.dirty() || lx.dirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [exp, nr, cs, lx]);

  const itemTotal = (i: Exp) => Math.round(num(i.qty || "1") * num(i.unit));
  const expTotal = items.reduce((a, i) => a + itemTotal(i), 0);
  const salaryItems = items.filter((i) => /lương|luong/i.test(i.name)).reduce((a, i) => a + itemTotal(i), 0);
  const investItems = items.filter((i) => /đầu tư|dau tu|set up/i.test(i.name)).reduce((a, i) => a + itemTotal(i), 0);
  const newTotal = rooms.reduce((a, r) => a + Math.round(num(r.total)), 0);
  const rentFixed = ledger.rentMonthly > 0;

  const rows = [
    { k: "dien", label: "Điện", thu: thu.dien, chi: num(chi.dien) },
    { k: "nuoc", label: "Nước", thu: thu.nuoc, chi: num(chi.nuoc) },
    { k: "mang", label: "Mạng", thu: thu.mang, chi: num(chi.mang) },
    { k: "dich_vu", label: "Dịch vụ", thu: thu.dich_vu, chi: num(chi.dich_vu) },
    { k: "tien_phong", label: "Tiền phòng", thu: thu.tien_phong, chi: rentFixed ? ledger.rentMonthly : num(chi.tien_phong) },
  ];
  const salary = salaryItems || ledger.salaryMonthly;
  const thuTotal = rows.reduce((a, r) => a + r.thu, 0) + newTotal + thu.phat_sinh;
  const chiTotal = rows.reduce((a, r) => a + r.chi, 0) + (expTotal - investItems - salaryItems) + salary;
  const profit = thuTotal - chiTotal;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {/* ===== Chi phí phát sinh ===== */}
        <section onBlur={exp.flush} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-center text-base font-bold tracking-wide">CHI PHÍ PHÁT SINH (#)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead><tr><th className={`${th} w-8`} /><th className={`${th} min-w-[14rem]`}>Tên hạng mục</th><th className={`${th} w-14`}>Số lượng</th><th className={`${th} w-28`}>Đơn giá</th><th className={`${th} w-28 text-right`}>Thành tiền</th><th className={`${th} w-24`}>Ghi chú</th><th className={`${th} w-8`} /></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={pins.includes(it.name.trim()) && it.name.trim() ? "bg-amber-50" : ""}>
                    <td className={td}>
                      <button type="button" onClick={() => void togglePin(it)} title={pins.includes(it.name.trim()) && it.name.trim() ? "Đã ghim: tự có ở các tháng sau. Bấm để bỏ ghim" : "Ghim: tự có sẵn ở các tháng sau"} aria-label="Ghim khoản này"
                        className={`rounded p-1 ${pins.includes(it.name.trim()) && it.name.trim() ? "text-amber-600" : "text-gray-300 hover:text-amber-500"}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill={pins.includes(it.name.trim()) && it.name.trim() ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2h-5v5l-1 1-1-1v-5H5v-2l3-3z" /></svg>
                      </button>
                    </td>
                    <td className={td}><input className={inp} value={it.name} placeholder="VD: Sửa điều hòa 202" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                    <td className={td}><input className={`${inp} text-right`} type="number" min="0" inputMode="decimal" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></td>
                    <td className={td}><MoneyInput allowNegative value={it.unit} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, unit: v } : x)))} /></td>
                    <td className={`${td} text-right font-medium`}>{vnd(itemTotal(it))}</td>
                    <td className={td}><input className={inp} value={it.note} placeholder="(nếu cần)" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} /></td>
                    <td className={td}><button type="button" aria-label="Xóa dòng" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
                <tr className="bg-yellow-100 font-bold"><td className={td} colSpan={4}>TỔNG</td><td className={`${td} text-right`}>{vnd(expTotal)}</td><td className={td} colSpan={2} /></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setItems([...items, { name: "", qty: "1", unit: "", note: "" }])} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm dòng</button>
            <button type="button" onClick={exp.flush} className="rounded-xl border border-brand-300 bg-white px-4 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Lưu ngay</button>
            <StatusText t={msg.exp} />
          </div>
          <p className="mt-1 text-xs text-gray-500">Bấm hình ghim bên trái để ghim khoản lặp hàng tháng (lương, mạng, vệ sinh…): từ tháng sau tự có sẵn. Tự động lưu khi anh rời ô hoặc ngừng gõ khoảng 1 giây. Dòng có chữ &quot;lương&quot; tính là lương quản lý, dòng &quot;đầu tư&quot; không tính vào lãi tháng (tính vào vốn).</p>
        </section>

        {/* ===== Thu tiền phòng mới ===== */}
        <section onBlur={nr.flush} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-center text-base font-bold tracking-wide">THU TIỀN PHÒNG MỚI (*)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse">
              <thead><tr><th className={`${th} w-20`}>Tên phòng</th><th className={`${th} w-28`}>Đơn giá phòng</th><th className={`${th} w-16`}>Số người</th><th className={`${th} w-28`}>Số điện thoại</th><th className={`${th} w-28`}>Tổng thu</th><th className={th}>Ghi chú ngày hợp đồng</th><th className={`${th} w-8`} /></tr></thead>
              <tbody>
                {rooms.map((r, i) => {
                  const up = (p: Partial<NR>) => setRooms(rooms.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  return (
                    <tr key={i}>
                      <td className={td}><input className={inp} value={r.room} onChange={(e) => up({ room: e.target.value })} /></td>
                      <td className={td}><MoneyInput value={r.rent} onChange={(v) => up({ rent: v, total: r.total || String(num(v) * 2) })} /></td>
                      <td className={td}><input className={`${inp} text-right`} type="number" min="1" value={r.people} onChange={(e) => up({ people: e.target.value })} /></td>
                      <td className={td}><input className={inp} inputMode="tel" value={r.phone} onChange={(e) => up({ phone: e.target.value })} /></td>
                      <td className={td}><MoneyInput value={r.total} onChange={(v) => up({ total: v })} /></td>
                      <td className={td}><input className={inp} value={r.note} placeholder="VD: 26/01" onChange={(e) => up({ note: e.target.value })} /></td>
                      <td className={td}><button type="button" aria-label="Xóa dòng" onClick={() => setRooms(rooms.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">✕</button></td>
                    </tr>
                  );
                })}
                <tr className="bg-yellow-100 font-bold"><td className={td} colSpan={4}>TỔNG</td><td className={`${td} text-right`}>{vnd(newTotal)}</td><td className={td} colSpan={2} /></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setRooms([...rooms, { room: "", rent: "", people: "1", phone: "", total: "", note: "" }])} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm phòng mới</button>
            <button type="button" onClick={nr.flush} className="rounded-xl border border-brand-300 bg-white px-4 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Lưu ngay</button>
            <StatusText t={msg.new} />
          </div>
          <p className="mt-1 text-xs text-gray-500">Khoản thu ngoài hóa đơn tháng: tiền cọc và tiền tháng đầu của khách mới vào. Tổng này cộng vào doanh thu tháng.</p>
        </section>
      </div>

      {/* ===== Chi tiết lợi nhuận ===== */}
      <section onBlur={cs.flush} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-center text-base font-bold tracking-wide">CHI TIẾT LỢI NHUẬN THÁNG {month.slice(5)}/{month.slice(0, 4)}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse">
            <thead><tr><th className={th}>Khoản</th><th className={`${th} text-right`}>Tổng thu</th><th className={`${th} w-40 text-right`}>Tổng chi</th><th className={`${th} text-right`}>Chủ nhà thu</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}>
                  <td className={`${td} font-semibold`}>{r.label.toUpperCase()}</td>
                  <td className={`${td} text-right`}>{vnd(r.thu)}</td>
                  <td className={td}>
                    {r.k === "tien_phong" && rentFixed
                      ? <div className="text-right">{vnd(ledger.rentMonthly)}<div className="text-[11px] text-gray-400">chia đều theo tháng (Cài đặt)</div></div>
                      : <MoneyInput allowNegative value={chi[r.k]} onChange={(v) => setChi({ ...chi, [r.k]: v })} />}
                  </td>
                  <td className={`${td} text-right ${r.thu - r.chi < 0 ? "text-red-700" : ""}`}>{vnd(r.thu - r.chi)}</td>
                </tr>
              ))}
              <tr><td className={`${td} font-semibold`}>MỚI (*)</td><td className={`${td} text-right`}>{vnd(newTotal)}</td><td className={`${td} text-right text-gray-400`}>—</td><td className={`${td} text-right`}>{vnd(newTotal)}</td></tr>
              <tr><td className={`${td} font-semibold`}>CHI PHÍ PHÁT SINH</td><td className={`${td} text-right`}>{vnd(thu.phat_sinh)}</td><td className={`${td} text-right`}>{vnd(expTotal - investItems - salaryItems)}</td><td className={`${td} text-right ${thu.phat_sinh - (expTotal - investItems - salaryItems) < 0 ? "text-red-700" : ""}`}>{vnd(thu.phat_sinh - (expTotal - investItems - salaryItems))}</td></tr>
              {salary > 0 && <tr><td className={`${td} font-semibold`}>LƯƠNG QUẢN LÝ</td><td className={`${td} text-right text-gray-400`}>—</td><td className={`${td} text-right`}>{vnd(salary)}</td><td className={`${td} text-right text-red-700`}>{vnd(-salary)}</td></tr>}
              <tr className="bg-brand-50 text-base font-extrabold"><td className={td}>TỔNG</td><td className={`${td} text-right`}>{vnd(thuTotal)}</td><td className={`${td} text-right`}>{vnd(chiTotal)}</td><td className={`${td} text-right ${profit < 0 ? "text-red-700" : "text-green-700"}`}>{vnd(profit)}</td></tr>
              {ledger.partners.map((p) => (
                <tr key={p.name} className="text-gray-700"><td className={td} colSpan={3}>→ {p.name} ({p.pct}%)</td><td className={`${td} text-right`}>{vnd((profit * p.pct) / 100)}</td></tr>
              ))}
              {investItems > 0 && <tr className="text-amber-800"><td className={td} colSpan={3}>Đầu tư tháng này (không tính vào lãi)</td><td className={`${td} text-right`}>{vnd(investItems)}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={cs.flush} className="rounded-xl border border-brand-300 bg-white px-4 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Lưu ngay</button>
          <StatusText t={msg.chi} />
        </div>
        <p className="mt-1 text-xs text-gray-500">Cột &quot;Tổng thu&quot; tự tính từ hóa đơn các phòng ngay trên màn hình. Nhập số tiền thực tế anh trả (điện, nước, mạng, dịch vụ, thuê nhà) vào cột &quot;Tổng chi&quot; để ra lãi.</p>
      </section>

      {/* ===== Thanh toán thực tế với chủ nhà (nhà ở chung với chủ) ===== */}
      {!ll.enabled ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-3 text-sm text-gray-600">
          Nhà ở chung với chủ, tiền điện nước đóng theo mã điện cả nhà?{" "}
          <button type="button" onClick={() => void saveLl({ ...ll, enabled: true })} className="font-semibold text-brand-700 hover:underline">Bật bảng thanh toán với chủ nhà</button>
        </div>
      ) : (() => {
        const rentOwed = rentFixed ? ledger.rentMonthly : num(chi.tien_phong);
        const eRooms = roomCosts.filter((r) => ll.elecRoomIds.includes(r.id));
        const wRooms = roomCosts.filter((r) => ll.waterRoomIds.includes(r.id));
        const dien = eRooms.reduce((t, r) => t + r.elec, 0), nuoc = wRooms.reduce((t, r) => t + r.water, 0);
        const phatSinh = llExtras.reduce((a, r) => a + Math.round(num(r.amount)), 0);
        const pay = rentOwed - dien - nuoc - phatSinh;
        const line = "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-gray-100 px-3 py-2";
        const sel = "rounded border border-gray-300 bg-white px-2 py-1 text-sm";
        return (
          <section className="rounded-2xl border border-stone-200 border-t-4 border-t-teal-400 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold tracking-wide">THANH TOÁN THỰC TẾ VỚI CHỦ NHÀ · THÁNG {month.slice(5)}/{month.slice(0, 4)}</h2>
              <button type="button" onClick={() => void saveLl({ ...ll, enabled: false })} className="text-xs text-gray-500 hover:underline">Tắt bảng này</button>
            </div>
            <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-gray-200">
              <div className={`${line} bg-teal-50`}><span className="font-semibold text-teal-900">Tiền thuê nhà hàng tháng</span><span className="text-base font-bold tabular-nums text-teal-900">{vnd(rentOwed)}</span></div>
              {([["Tiền điện", "elecRoomIds", eRooms, dien, "elec", "text-amber-800"], ["Tiền nước", "waterRoomIds", wRooms, nuoc, "water", "text-sky-800"]] as const).map(([title, key, chosen, amount, f, tone]) => (
                <div key={key} className={line}>
                  <span className="text-gray-700">− {title} của các phòng:</span>
                  <span className={`font-semibold tabular-nums ${tone}`}>{vnd(amount)}</span>
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    {chosen.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 py-0.5 pl-2.5 pr-1 text-xs">
                        Phòng {r.code}: <b className="tabular-nums">{vnd(r[f])}</b>
                        <button type="button" aria-label={`Bỏ phòng ${r.code}`} onClick={() => void saveLl({ ...ll, [key]: ll[key].filter((x) => x !== r.id) })} className="rounded-full px-1 text-gray-400 hover:text-red-600">✕</button>
                      </span>
                    ))}
                    <select value="" onChange={(e) => { const id = Number(e.target.value); if (id) void saveLl({ ...ll, [key]: [...ll[key], id] }); }} className={sel}>
                      <option value="">{chosen.length ? "+ thêm phòng" : "— chọn phòng —"}</option>
                      {roomCosts.filter((r) => !ll[key].includes(r.id)).map((r) => <option key={r.id} value={r.id}>Phòng {r.code}{r.tenant ? ` (${r.tenant})` : ""}</option>)}
                    </select>
                    {chosen.length < roomCosts.length && roomCosts.length > 1 && <button type="button" onClick={() => void saveLl({ ...ll, [key]: roomCosts.map((r) => r.id) })} className="text-xs text-brand-700 hover:underline">chọn tất cả</button>}
                  </div>
                </div>
              ))}
              <div className="border-b border-gray-100 px-3 py-2" onBlur={lx.flush}>
                <div className="mb-1 flex items-baseline justify-between gap-3"><span className="text-gray-700">− Chi phí phát sinh <span className="text-xs text-gray-400">(tự điền nội dung - số tiền, nếu có)</span></span><span className="font-semibold tabular-nums">{vnd(phatSinh)}</span></div>
                <div className="space-y-1.5">
                  {llExtras.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
                      <input className={inp} value={r.name} placeholder="Nội dung (VD: sửa vòi nước)" onChange={(e) => setLlExtras(llExtras.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <MoneyInput allowNegative value={r.amount} onChange={(v) => setLlExtras(llExtras.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                      <button type="button" aria-label="Xóa dòng" onClick={() => setLlExtras(llExtras.filter((_, j) => j !== i))} className="px-1 text-gray-400 hover:text-red-600">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setLlExtras([...llExtras, { name: "", amount: "" }])} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm dòng</button>
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-3 bg-brand-50 px-3 py-3">
                <span className="font-extrabold text-brand-900">{pay >= 0 ? "THỰC TẾ ANH ĐÓNG CHỦ NHÀ" : "CHỦ NHÀ CÒN PHẢI TRẢ LẠI ANH"}</span>
                <span className={`text-xl font-extrabold tabular-nums ${pay >= 0 ? "text-brand-900" : "text-green-700"}`}>{vnd(Math.abs(pay))}</span>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-gray-500">Công thức: tiền thuê nhà − tiền điện − tiền nước − chi phí phát sinh. Tiền điện, nước lấy theo các phòng anh chọn; phát sinh anh tự điền. <StatusText t={msg.ll} /></p>
            <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-end gap-3 rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-3">
              <div className="min-w-[12rem] flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-600">Tên chủ nhà (ghi trên bill, không bắt buộc)</label>
                <input className={inp} value={ll.name} placeholder="VD: Anh Mười" onChange={(e) => setLl({ ...ll, name: e.target.value })} onBlur={() => void saveLl(ll)} />
              </div>
              {llToken ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/bill/${llToken}/${month}`} target="_blank" rel="noopener" className="rounded-lg bg-gradient-to-b from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-brand-700 hover:to-brand-800">Xem bill để gửi chủ nhà</a>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/bill/${llToken}/${month}`); setMsg((p) => ({ ...p, ll: "Đã chép link bill" })); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm hover:bg-gray-50">Chép link</button>
                </div>
              ) : <span className="text-xs text-gray-500">Chọn phòng điện/nước để tạo bill gửi chủ nhà.</span>}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
