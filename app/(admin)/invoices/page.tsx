import { selectedMonth } from "@/lib/month";
import Link from "next/link";
import { invoicesOfMonth } from "@/lib/queries";
import { currentHouse } from "@/lib/house";
import { currentMonth, dateVN, monthLabel, vnd } from "@/lib/format";
import { generateInvoices } from "../../actions";
import { Flash, StatusBadge } from "../../components";
import { btnCls, cardCls, tdCls, thCls } from "@/lib/ui";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const month = await selectedMonth();
  const house = await currentHouse();
  const invoices = await invoicesOfMonth(house.id, month);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Hóa đơn tháng {monthLabel(month)}</h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <form action={generateInvoices} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="month" value={month} />
        <button className={btnCls}>{invoices.length ? "Tính lại tất cả hóa đơn" : "Tạo hóa đơn cả tháng"}</button>
        <span className="text-xs text-gray-600">Lấy giá thuê, điện nước, dịch vụ, phát sinh và nợ kỳ trước. Các khoản đã thu được giữ nguyên.</span>
      </form>
      <section className={`${cardCls} overflow-x-auto`}>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có hóa đơn. Nhập chỉ số điện nước rồi bấm tạo hóa đơn.</p>
        ) : (
          <table className="w-full">
            <thead><tr><th className={thCls}>Phòng</th><th className={thCls}>Khách</th><th className={thCls}>Hạn</th><th className={`${thCls} text-right`}>Tổng</th><th className={`${thCls} text-right`}>Đã thu</th><th className={thCls}>Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className={tdCls}><Link className="font-medium text-brand-700 hover:underline" href={`/invoices/${i.id}`}>{i.code}</Link></td>
                  <td className={tdCls}>{i.tenant_name}{!i.has_reading && <span className="ml-1 text-xs text-amber-700">(thiếu chỉ số)</span>}</td>
                  <td className={tdCls}>{dateVN(i.due_date)}</td>
                  <td className={`${tdCls} text-right`}>{vnd(i.total)}</td>
                  <td className={`${tdCls} text-right`}>{vnd(i.paid)}</td>
                  <td className={tdCls}><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
