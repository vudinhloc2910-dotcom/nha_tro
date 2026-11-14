import { all } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { currentMonth, monthLabel, prevMonth } from "@/lib/format";
import { saveReadings } from "../../actions";
import { Flash, MonthPicker } from "../../components";
import { btnCls, cardCls, inputCls, tdCls, thCls } from "@/lib/ui";

type Row = {
  id: number; code: string; people: number | null;
  cur_eo: number | null; cur_en: number | null; cur_wo: number | null; cur_wn: number | null;
  prev_en: number | null; prev_wn: number | null;
};

export default async function ReadingsPage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const rows = await all<Row>(
    `SELECT r.id, r.code, t.people,
       c.elec_old cur_eo, c.elec_new cur_en, c.water_old cur_wo, c.water_new cur_wn,
       p.elec_new prev_en, p.water_new prev_wn
     FROM rooms r
     LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1
     LEFT JOIN readings c ON c.room_id=r.id AND c.month=?
     LEFT JOIN readings p ON p.room_id=r.id AND p.month=?
     WHERE r.house_id=?
     ORDER BY r.code`,
    month, prevMonth(month), house.id
  );
  const occupied = rows.filter((r) => r.people !== null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Chỉ số điện nước tháng {monthLabel(month)}</h1>
        <MonthPicker action="/readings" month={month} />
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <p className="text-sm text-gray-600">
        Số cũ tự lấy từ số mới của tháng trước (sửa được nếu tháng đầu hoặc thay đồng hồ). Chỉ cần nhập số mới; để trống phòng nào thì phòng đó không lưu.
      </p>
      <form action={saveReadings} className={`${cardCls} overflow-x-auto`}>
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="ids" value={occupied.map((r) => r.id).join(",")} />
        <table className="w-full">
          <thead>
            <tr>
              <th className={thCls}>Phòng</th>
              <th className={thCls}>Điện cũ</th><th className={thCls}>Điện mới</th>
              <th className={thCls}>Nước cũ</th><th className={thCls}>Nước mới</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {occupied.map((r) => (
              <tr key={r.id}>
                <td className={`${tdCls} font-medium`}>{r.code}</td>
                <td className={tdCls}><input name={`eo_${r.id}`} type="number" step="0.1" min="0" defaultValue={r.cur_eo ?? r.prev_en ?? 0} className={`${inputCls} w-24`} /></td>
                <td className={tdCls}><input name={`en_${r.id}`} type="number" step="0.1" min="0" defaultValue={r.cur_en ?? ""} className={`${inputCls} w-24`} /></td>
                <td className={tdCls}><input name={`wo_${r.id}`} type="number" step="0.1" min="0" defaultValue={r.cur_wo ?? r.prev_wn ?? 0} className={`${inputCls} w-24`} /></td>
                <td className={tdCls}><input name={`wn_${r.id}`} type="number" step="0.1" min="0" defaultValue={r.cur_wn ?? ""} className={`${inputCls} w-24`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4"><button className={btnCls}>Lưu chỉ số</button></div>
      </form>
    </div>
  );
}
