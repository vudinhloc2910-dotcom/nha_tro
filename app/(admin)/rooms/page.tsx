import Link from "next/link";
import { all } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { vnd } from "@/lib/format";
import { addRoom } from "../../actions";
import { Flash } from "../../components";
import { btnCls, cardCls, inputCls, labelCls, tdCls, thCls } from "@/lib/ui";

type Row = { id: number; code: string; rent: number; due_day: number; name: string | null; people: number | null };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const rooms = await all<Row>(
    `SELECT r.id, r.code, r.rent, r.due_day, t.name, t.people
     FROM rooms r LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1 WHERE r.house_id=? ORDER BY r.code`,
    house.id
  );
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Phòng & khách thuê <span className="text-base font-normal text-gray-600">· {house.name}</span></h1>
      <Flash ok={sp.ok} err={sp.err} />
      <section className={`${cardCls} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={thCls}>Phòng</th><th className={thCls}>Khách</th><th className={thCls}>Số người</th><th className={`${thCls} text-right`}>Giá thuê</th><th className={thCls}>Hạn đóng</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rooms.map((r) => (
              <tr key={r.id}>
                <td className={tdCls}><Link className="font-medium text-brand-700 hover:underline" href={`/rooms/${r.id}`}>{r.code}</Link></td>
                <td className={tdCls}>{r.name ?? <span className="text-gray-500">Trống</span>}</td>
                <td className={tdCls}>{r.people ?? "-"}</td>
                <td className={`${tdCls} text-right`}>{vnd(r.rent)}</td>
                <td className={tdCls}>Ngày {r.due_day}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Thêm phòng</h2>
        <form action={addRoom} className="grid gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>Số phòng</label><input name="code" required className={inputCls} /></div>
          <div><label className={labelCls}>Giá thuê (đ)</label><input name="rent" type="number" min="0" className={inputCls} /></div>
          <div><label className={labelCls}>Hạn đóng (ngày)</label><input name="due_day" type="number" min="1" max="31" defaultValue={15} className={inputCls} /></div>
          <div className="flex items-end"><button className={btnCls}>Thêm</button></div>
        </form>
      </section>
    </div>
  );
}
