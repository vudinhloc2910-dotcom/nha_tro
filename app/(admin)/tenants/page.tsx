import Link from "next/link";
import { all, readAll } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { dateVN, today, vnd } from "@/lib/format";
import { toggleResidence, type ResidentRow } from "../../actions";
import { ResidentsTable } from "../../residents-table";
import { accent, cardCls, tdCls, thCls } from "@/lib/ui";

type T = {
  room_id: number; code: string; name: string; phone: string | null; people: number; move_in: string | null;
  deposit: number; contract_end: string | null; residence_done: number; vehicles: number;
};

/** Danh sách khách thuê của nhà đang chọn: liên hệ Zalo, hợp đồng, cọc, tạm trú, phương tiện. */
export default async function TenantsPage() {
  const house = await currentHouse();
  const rows = await all<T>(
    `SELECT r.id room_id, r.code, t.name, t.phone, t.people, t.move_in, t.deposit, t.contract_end, t.residence_done,
       (SELECT COUNT(*) FROM vehicles v WHERE v.room_id=r.id) vehicles
     FROM tenants t JOIN rooms r ON r.id=t.room_id WHERE r.house_id=? AND t.active=1 ORDER BY r.code`, house.id
  );
  rows.sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true }));
  const [resR, codeR] = await readAll([
    { sql: "SELECT room_code room, name, cccd, gender, dob, phone, job, address, plate, vehicle, emergency FROM residents WHERE house_id=? ORDER BY sort, id", args: [house.id] },
    { sql: "SELECT code FROM rooms WHERE house_id=? ORDER BY code", args: [house.id] },
  ]);
  const residents = resR as ResidentRow[];
  const roomCodes = (codeR as { code: string }[]).map((r) => r.code).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  const people = rows.reduce((a, r) => a + r.people, 0);
  const deposit = rows.reduce((a, r) => a + (r.deposit ?? 0), 0);
  const t0 = today();
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(t0)) / 86400000);
  const zalo = (p: string) => { const z = p.replace(/[^\d]/g, ""); return z.length >= 9 ? `https://zalo.me/${z.startsWith("84") ? "0" + z.slice(2) : z}` : ""; };

  return (
    <div className="relative left-1/2 w-[min(calc(100vw-8rem),1700px)] -translate-x-1/2 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Khách thuê</h1>
        <p className="text-sm text-gray-600">{house.name}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className={`${cardCls} ${accent.blue}`}><div className="text-xs text-gray-500">Khách / phòng</div><div className="mt-1 text-lg font-bold">{rows.length}</div></div>
        <div className={`${cardCls} ${accent.teal}`}><div className="text-xs text-gray-500">Tổng số người</div><div className="mt-1 text-lg font-bold">{people}</div></div>
        <div className={`${cardCls} ${accent.violet}`}><div className="text-xs text-gray-500">Cọc đang giữ</div><div className="mt-1 text-lg font-bold">{vnd(deposit)}</div></div>
      </div>

      <section className={`${cardCls} overflow-x-auto`}>
        {rows.length === 0 ? <p className="text-sm text-gray-600">Nhà này chưa có khách thuê. Thêm khách ở trang phòng.</p> : (
          <table className="w-full min-w-[40rem]">
            <thead><tr><th className={thCls}>Phòng</th><th className={thCls}>Khách</th><th className={thCls}>Liên hệ</th><th className={thCls}>Hợp đồng</th><th className={`${thCls} text-right`}>Cọc</th><th className={thCls}>Tạm trú</th><th className={thCls}>Xe</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const left = r.contract_end ? days(r.contract_end) : null;
                const z = zalo(r.phone ?? "");
                return (
                  <tr key={r.room_id}>
                    <td className={tdCls}><Link href={`/rooms/${r.room_id}`} className="font-semibold text-brand-800 hover:underline">{r.code}</Link></td>
                    <td className={tdCls}>{r.name}<div className="text-xs text-gray-500">{r.people} người{r.move_in ? ` · vào ${dateVN(r.move_in)}` : ""}</div></td>
                    <td className={tdCls}>{r.phone ? <>{r.phone} {z && <a href={z} target="_blank" rel="noopener" className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Zalo</a>}</> : <span className="text-gray-400">Chưa có SĐT</span>}</td>
                    <td className={tdCls}>{left === null ? <span className="text-gray-400">Chưa nhập</span> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${left < 0 ? "bg-rose-100 text-rose-800" : left <= 30 ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{left < 0 ? `Hết ${-left} ngày trước` : left === 0 ? "Hết hôm nay" : `Còn ${left} ngày`}</span>}{r.contract_end && <div className="text-xs text-gray-500">đến {dateVN(r.contract_end)}</div>}</td>
                    <td className={`${tdCls} text-right`}>{vnd(r.deposit ?? 0)}</td>
                    <td className={tdCls}>
                      <form action={toggleResidence} className="flex items-center gap-2">
                        <input type="hidden" name="room_id" value={r.room_id} /><input type="hidden" name="done" value={r.residence_done ? "0" : "1"} /><input type="hidden" name="back" value="/tenants" />
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.residence_done ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-600"}`}>{r.residence_done ? "Đã khai" : "Chưa khai"}</span>
                        <button className="text-xs text-brand-700 hover:underline">{r.residence_done ? "Bỏ" : "Đánh dấu"}</button>
                      </form>
                    </td>
                    <td className={tdCls}>{r.vehicles || <span className="text-gray-400">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <ResidentsTable key={JSON.stringify(residents).length + "-" + residents.length} initial={residents} roomCodes={roomCodes} />
    </div>
  );
}
