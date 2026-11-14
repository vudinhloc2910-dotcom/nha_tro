import Link from "next/link";
import { all } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { currentMonth, vnd } from "@/lib/format";
import { addLedgerEntry, deleteLedgerEntry } from "../../actions";
import { Flash } from "../../components";
import { accent, btnCls, btnDangerCls, cardCls, inputCls, labelCls } from "@/lib/ui";

type L = { id: number; month: string; kind: "thu" | "chi"; category: string; name: string; amount: number; source: string };
const CAT: Record<string, string> = { dien: "Điện", nuoc: "Nước", mang: "Mạng", dich_vu: "Dịch vụ", tien_phong: "Thuê nhà", phat_sinh: "Phát sinh", luong: "Lương", dau_tu: "Đầu tư", phong_moi: "Phòng mới" };

/** Sổ thu chi của nhà: mọi khoản chi và thu ngoài hóa đơn trong năm, nhóm theo tháng. */
export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; year?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const year = /^20\d{2}$/.test(sp.year ?? "") ? Number(sp.year) : Number(currentMonth().slice(0, 4));
  const rows = await all<L>("SELECT id, month, kind, category, name, amount, source FROM ledger WHERE house_id=? AND month LIKE ? ORDER BY month DESC, id DESC", house.id, `${year}-%`);
  const thu = rows.filter((r) => r.kind === "thu").reduce((a, r) => a + r.amount, 0);
  const chi = rows.filter((r) => r.kind === "chi").reduce((a, r) => a + r.amount, 0);
  const byMonth = new Map<string, L[]>();
  for (const r of rows) byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold">Sổ thu chi {year}</h1><p className="text-sm text-gray-600">{house.name}</p></div>
        <div className="flex gap-2">
          {[2025, 2026, 2027].map((y) => (
            <Link key={y} href={`/ledger?year=${y}`} className={`rounded-xl border px-3 py-1.5 text-sm ${y === year ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"}`}>{y}</Link>
          ))}
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid grid-cols-3 gap-3">
        <div className={`${cardCls} ${accent.teal}`}><div className="text-xs text-gray-500">Thu ngoài hóa đơn</div><div className="mt-1 text-base font-bold sm:text-lg">{vnd(thu)}</div></div>
        <div className={`${cardCls} ${accent.rose}`}><div className="text-xs text-gray-500">Tổng chi</div><div className="mt-1 text-base font-bold sm:text-lg">{vnd(chi)}</div></div>
        <div className={`${cardCls} ${accent.violet}`}><div className="text-xs text-gray-500">Số dòng</div><div className="mt-1 text-base font-bold sm:text-lg">{rows.length}</div></div>
      </div>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Ghi một khoản</h2>
        <form action={addLedgerEntry} className="grid gap-3 sm:grid-cols-6">
          <div><label className={labelCls}>Loại</label><select name="kind" className={inputCls}><option value="chi">Chi</option><option value="thu">Thu</option></select></div>
          <div><label className={labelCls}>Tháng</label><input name="month" type="month" defaultValue={currentMonth()} className={inputCls} /></div>
          <div><label className={labelCls}>Nhóm</label><select name="category" className={inputCls} defaultValue="phat_sinh">{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="sm:col-span-2"><label className={labelCls}>Nội dung</label><input name="name" required className={inputCls} placeholder="VD: Thay bóng đèn hành lang" /></div>
          <div><label className={labelCls}>Số tiền (đ)</label><input name="amount" type="number" min="0" required className={inputCls} /></div>
          <div className="sm:col-span-6"><button className={btnCls}>Ghi vào sổ</button> <span className="ml-2 text-xs text-gray-500">Khoản chi vào đây sẽ tính vào báo cáo lãi lỗ của tháng đó.</span></div>
        </form>
      </section>

      {rows.length === 0 && <p className={`${cardCls} text-sm text-gray-500`}>Năm {year} chưa có khoản nào.</p>}
      {[...byMonth.entries()].map(([m, list]) => (
        <section key={m} className={cardCls}>
          <h2 className="mb-2 flex items-baseline justify-between font-semibold">Tháng {m.slice(5)}/{m.slice(0, 4)}
            <span className="text-sm font-normal text-gray-500">Chi {vnd(list.filter((x) => x.kind === "chi").reduce((a, x) => a + x.amount, 0))}</span></h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.kind === "thu" ? "bg-teal-100 text-teal-800" : "bg-rose-100 text-rose-800"}`}>{r.kind === "thu" ? "Thu" : "Chi"}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{CAT[r.category] ?? r.category}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <b className="shrink-0">{vnd(r.amount)}</b>
                <form action={deleteLedgerEntry}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="year" value={year} /><button className={btnDangerCls}>Xóa</button></form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
