"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveChiCategories, saveExpenseItems, saveNewRooms } from "./actions";
import { vnd } from "@/lib/format";
import type { LedgerMonth } from "@/lib/ledgermonth";

const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const th = "border-b border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold uppercase text-gray-600";
const td = "border-b border-gray-100 px-2 py-1.5 align-middle";
const num = (s: string) => { const n = Number(String(s).trim().replace(",", ".")); return Number.isFinite(n) ? n : 0; };

type Exp = { name: string; qty: string; unit: string };
type NR = { room: string; rent: string; people: string; phone: string; total: string; note: string };
export type LiveThu = { dien: number; nuoc: number; mang: number; dich_vu: number; tien_phong: number; phat_sinh: number };

/** Ba bảng dưới bảng hóa đơn (giống cuối tab sheet): Chi phí phát sinh, Thu tiền phòng mới, Chi tiết lợi nhuận. */
export function MonthExtras({ month, thu, ledger }: { month: string; thu: LiveThu; ledger: LedgerMonth }) {
  const router = useRouter();
  const [items, setItems] = useState<Exp[]>(ledger.items.map((i) => ({ name: i.name, qty: String(i.qty), unit: String(i.unit) })));
  const [rooms, setRooms] = useState<NR[]>(ledger.newRooms.map((r) => ({ room: r.room, rent: String(r.rent), people: String(r.people), phone: r.phone, total: String(r.total), note: r.note })));
  const [chi, setChi] = useState<Record<string, string>>({
    dien: ledger.chi.dien ? String(ledger.chi.dien) : "", nuoc: ledger.chi.nuoc ? String(ledger.chi.nuoc) : "", mang: ledger.chi.mang ? String(ledger.chi.mang) : "",
    dich_vu: ledger.chi.dich_vu ? String(ledger.chi.dich_vu) : "", tien_phong: ledger.chi.tien_phong ? String(ledger.chi.tien_phong) : "",
  });
  const [msg, setMsg] = useState<Record<string, string>>({});
  const flash = (k: string, t: string) => { setMsg((p) => ({ ...p, [k]: t })); setTimeout(() => setMsg((p) => ({ ...p, [k]: "" })), 2500); };

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

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg((p) => ({ ...p, [key]: "Đang lưu…" }));
    const r = await fn();
    if (r.ok) { flash(key, "Đã lưu ✓"); router.refresh(); } else flash(key, r.error ?? "Không lưu được");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {/* ===== Chi phí phát sinh ===== */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-center text-base font-bold tracking-wide">CHI PHÍ PHÁT SINH (#)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse">
              <thead><tr><th className={th}>Tên hạng mục</th><th className={`${th} w-16`}>Số lượng</th><th className={`${th} w-28`}>Đơn giá</th><th className={`${th} w-28 text-right`}>Thành tiền</th><th className={`${th} w-8`} /></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className={td}><input className={inp} value={it.name} placeholder="VD: Sửa điều hòa 202" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                    <td className={td}><input className={`${inp} text-right`} type="number" min="0" inputMode="decimal" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></td>
                    <td className={td}><input className={`${inp} text-right`} type="number" inputMode="numeric" value={it.unit} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} /></td>
                    <td className={`${td} text-right font-medium`}>{vnd(itemTotal(it))}</td>
                    <td className={td}><button type="button" aria-label="Xóa dòng" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
                <tr className="bg-yellow-100 font-bold"><td className={td} colSpan={3}>TỔNG</td><td className={`${td} text-right`}>{vnd(expTotal)}</td><td className={td} /></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setItems([...items, { name: "", qty: "1", unit: "" }])} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm dòng</button>
            <button type="button" onClick={() => run("exp", () => saveExpenseItems(month, items))} className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Lưu bảng phát sinh</button>
            <span className="text-sm text-green-700">{msg.exp}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Dòng có chữ &quot;lương&quot; tính là lương quản lý, dòng &quot;đầu tư&quot; không tính vào lãi tháng (tính vào vốn).</p>
        </section>

        {/* ===== Thu tiền phòng mới ===== */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
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
                      <td className={td}><input className={`${inp} text-right`} type="number" inputMode="numeric" value={r.rent} onChange={(e) => up({ rent: e.target.value, total: r.total || String(num(e.target.value) * 2) })} /></td>
                      <td className={td}><input className={`${inp} text-right`} type="number" min="1" value={r.people} onChange={(e) => up({ people: e.target.value })} /></td>
                      <td className={td}><input className={inp} inputMode="tel" value={r.phone} onChange={(e) => up({ phone: e.target.value })} /></td>
                      <td className={td}><input className={`${inp} text-right`} type="number" inputMode="numeric" value={r.total} onChange={(e) => up({ total: e.target.value })} /></td>
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
            <button type="button" onClick={() => run("new", () => saveNewRooms(month, rooms))} className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Lưu bảng phòng mới</button>
            <span className="text-sm text-green-700">{msg.new}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Khoản thu ngoài hóa đơn tháng: tiền cọc và tiền tháng đầu của khách mới vào. Tổng này cộng vào doanh thu tháng.</p>
        </section>
      </div>

      {/* ===== Chi tiết lợi nhuận ===== */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
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
                      : <input className={`${inp} text-right`} type="number" min="0" inputMode="numeric" value={chi[r.k]} placeholder="0" onChange={(e) => setChi({ ...chi, [r.k]: e.target.value })} />}
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
          <button type="button" onClick={() => run("chi", () => saveChiCategories(month, rentFixed ? { dien: chi.dien, nuoc: chi.nuoc, mang: chi.mang, dich_vu: chi.dich_vu } : chi))} className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Lưu số chi</button>
          <span className="text-sm text-green-700">{msg.chi}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">Cột &quot;Tổng thu&quot; tự tính từ hóa đơn các phòng ngay trên màn hình. Nhập số tiền thực tế anh trả (điện, nước, mạng, dịch vụ, thuê nhà) vào cột &quot;Tổng chi&quot; để ra lãi.</p>
      </section>
    </div>
  );
}
