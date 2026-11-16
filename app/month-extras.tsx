"use client";

import { useEffect, useState } from "react";
import { StatusText, useAutosave } from "./use-autosave";
import { pinExpense, saveChiCategories, saveExpenseItems, saveNewRooms, unpinExpense } from "./actions";
import { vnd } from "@/lib/format";
import type { LedgerMonth } from "@/lib/ledgermonth";

const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const th = "border-b border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold uppercase text-gray-600";
const td = "border-b border-gray-100 px-2 py-1.5 align-middle";
const num = (s: string) => { const n = Number(String(s).trim().replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Ô nhập tiền: hiện dấu chấm ngăn nghìn và đơn vị "đ" (giống cột Tổng thu), bên trong vẫn lưu dạng số thường. */
function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const digits = value.replace(/[^\d]/g, "");
  const shown = digits ? Number(digits).toLocaleString("vi-VN") : "";
  return (
    <div className="relative">
      <input inputMode="numeric" value={shown} placeholder={placeholder ?? "0"} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} className={`${inp} pr-6 text-right`} />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-500">đ</span>
    </div>
  );
}

type Exp = { name: string; qty: string; unit: string; note: string };
type NR = { room: string; rent: string; people: string; phone: string; total: string; note: string };
export type LiveThu = { dien: number; nuoc: number; mang: number; dich_vu: number; tien_phong: number; phat_sinh: number };


/** Ba bảng dưới bảng hóa đơn (giống cuối tab sheet): Chi phí phát sinh, Thu tiền phòng mới, Chi tiết lợi nhuận. */
export function MonthExtras({ month, thu, ledger }: { month: string; thu: LiveThu; ledger: LedgerMonth }) {
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
  const cs = useAutosave(chi, (v) => saveChiCategories(month, fixedRent ? { dien: v.dien, nuoc: v.nuoc, mang: v.mang, dich_vu: v.dich_vu } : v), setM("chi"));
  // Đóng tab hoặc tải lại trang khi còn phần chưa lưu: trình duyệt hỏi lại
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (exp.dirty() || nr.dirty() || cs.dirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [exp, nr, cs]);

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
                    <td className={td}><MoneyInput value={it.unit} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, unit: v } : x)))} /></td>
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
                      : <MoneyInput value={chi[r.k]} onChange={(v) => setChi({ ...chi, [r.k]: v })} />}
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
    </div>
  );
}
