import Link from "next/link";
import { listHouses } from "@/lib/db";
import { monthLabel, STATUS_CLASS, STATUS_LABEL, vnd } from "@/lib/format";
import { hasFilters, parseParams, runSearch, TYPE_LABEL, type SearchType } from "@/lib/search";
import { MoneyField } from "../../money-field";
import { DateVN } from "../../date-input";
import { btnCls, btnGhostCls, cardCls, inputCls, labelCls } from "@/lib/ui";

const TYPE_TONE: Record<SearchType, string> = {
  room: "bg-teal-100 text-teal-800", tenant: "bg-violet-100 text-violet-800", resident: "bg-sky-100 text-sky-800", vehicle: "bg-gray-200 text-gray-700",
  invoice: "bg-amber-100 text-amber-800", issue: "bg-orange-100 text-orange-800", ledger: "bg-rose-100 text-rose-800",
};

/** Tìm kiếm tổng thể: gõ từ khóa và/hoặc lọc theo loại dữ liệu, nhà, tháng, trạng thái, khoảng tiền. Giống hộp "Lọc chứng từ" của phần mềm quản lý. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = parseParams(sp);
  const houses = await listHouses();
  const active = p.q !== "" || hasFilters(p);
  const result = active ? await runSearch(p, 100) : null;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Tìm kiếm tổng thể</h1>

      <form action="/search" className={`${cardCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className={labelCls}>Từ khóa (tên khách, số phòng, SĐT, CCCD, biển số, nội dung… gõ không dấu cũng được)</label>
          <input name="q" defaultValue={p.q} autoFocus placeholder="VD: nguyen van a, 301, 29C1, quá hạn" className={inputCls} />
        </div>
        <div><label className={labelCls}>Loại dữ liệu</label>
          <select name="type" defaultValue={p.type} className={inputCls}>
            <option value="all">Tất cả</option>
            {(Object.keys(TYPE_LABEL) as SearchType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select></div>
        <div><label className={labelCls}>Nhà</label>
          <select name="house" defaultValue={p.house ?? ""} className={inputCls}>
            <option value="">Tất cả các nhà</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></div>
        <div><label className={labelCls}>Từ ngày</label><DateVN name="from" defaultValue={p.from} className={inputCls} /></div>
        <div><label className={labelCls}>Đến ngày</label><DateVN name="to" defaultValue={p.to} className={inputCls} /></div>
        <div><label className={labelCls}>Trạng thái hóa đơn</label>
          <select name="status" defaultValue={p.status} className={inputCls}>
            <option value="">Tất cả</option>
            <option value="paid">Đã thu</option><option value="partial">Thu một phần</option><option value="unpaid">Chưa thu</option><option value="overdue">Quá hạn</option>
          </select></div>
        <div><label className={labelCls}>Số tiền từ</label><MoneyField name="min" defaultValue={p.min ?? ""} className={inputCls} placeholder="0" /></div>
        <div><label className={labelCls}>Số tiền đến</label><MoneyField name="max" defaultValue={p.max ?? ""} className={inputCls} placeholder="không giới hạn" /></div>
        <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
          <p className="mb-2 text-sm font-semibold text-teal-900">Lọc phòng theo giá <span className="font-normal text-teal-800">(chỉ hiện phòng; giá riêng của phòng được ưu tiên, không có thì lấy giá chung của nhà)</span></p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><label className={labelCls}>Giá điện (đ/kWh)</label><input name="elec" defaultValue={p.elec} placeholder="VD: 3500 hoặc 3500, 3800" className={inputCls} /></div>
            <div><label className={labelCls}>Giá nước</label><input name="water" defaultValue={p.water} placeholder="VD: 35000 hoặc 20000-40000" className={inputCls} /></div>
            <div><label className={labelCls}>Tên dịch vụ</label><input name="svc" defaultValue={p.svc} placeholder="VD: wifi, giặt, rác, xe" className={inputCls} /></div>
            <div><label className={labelCls}>Giá dịch vụ</label><input name="svcPrice" defaultValue={p.svcPrice} placeholder="VD: 100000" className={inputCls} /></div>
          </div>
          <p className="mt-2 text-xs text-gray-600">Nhập một giá, nhiều giá cách nhau dấu phẩy (3500, 3800) hoặc một khoảng (3500-4000). Có thể gõ 3.500 hay 3500 đều được.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className={btnCls}>Tìm kiếm</button>
          <Link href="/search" className={btnGhostCls}>Xóa bộ lọc</Link>
          {result && result.total > 0 && <a href={`/search/export?${qs}`} className={btnGhostCls}>Tải về Excel (CSV)</a>}
          <span className="text-xs text-gray-500">Lọc ngày: hóa đơn tính theo kỳ thu, sự cố theo ngày báo, sổ thu chi theo tháng. Trạng thái và số tiền áp dụng cho hóa đơn, sổ thu chi, sự cố.</span>
        </div>
      </form>

      {!result ? (
        <section className={cardCls}><p className="text-sm text-gray-600">Gõ từ khóa hoặc chọn bộ lọc rồi bấm Tìm kiếm. Mẹo: ở bất kỳ trang nào bấm phím <b>/</b> để nhảy vào ô tìm nhanh trên thanh trên.</p></section>
      ) : result.total === 0 ? (
        <section className={cardCls}><p className="text-sm text-gray-600">Không thấy kết quả nào. Thử bỏ bớt bộ lọc hoặc gõ ngắn hơn.</p></section>
      ) : (
        <>
          <p className="text-sm text-gray-600">Tìm thấy <b>{result.total}</b> kết quả.</p>
          {result.groups.map((g) => (
            <section key={g.type} className={`${cardCls} overflow-hidden !p-0`}>
              <h2 className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold">
                <span><span className={`mr-2 rounded-full px-2 py-0.5 text-xs ${TYPE_TONE[g.type]}`}>{TYPE_LABEL[g.type]}</span>{g.total} kết quả</span>
                {g.total > g.hits.length && <span className="text-xs font-normal text-gray-500">Hiện {g.hits.length} đầu tiên, hãy lọc thêm</span>}
              </h2>
              <ul className="divide-y divide-gray-100">
                {g.hits.map((h) => (
                  <li key={`${h.type}-${h.id}`}>
                    <Link href={h.href} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2 hover:bg-brand-50">
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900">{h.title}</span>
                        <span className="block truncate text-xs text-gray-500">{h.sub}</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-gray-500">
                        {h.status && <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_CLASS[h.status]}`}>{STATUS_LABEL[h.status]}</span>}
                        {h.month && h.type === "ledger" && <span>{monthLabel(h.month)}</span>}
                        {h.amount !== undefined && h.type !== "invoice" && <span className="font-medium text-gray-700">{vnd(h.amount)}</span>}
                        <span>{h.house}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
