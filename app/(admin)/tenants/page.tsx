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
export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const house = await currentHouse();
  if (view === "history") return <HistoryView houseId={house.id} houseName={house.name} />;
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
      <ViewTabs view="now" />
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
                    <td className={tdCls}>{left === null ? <span className="text-gray-400">Chưa nhập</span> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${left < 0 ? "bg-rose-100 text-rose-800" : left <= 30 ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{left < 0 ? `Hết ${-left} ngày trước` : left === 0 ? "Hết hôm nay" : `Còn ${left} ngày`}</span>}{r.contract_end && <div className="text-xs text-gray-500">đến {dateVN(r.contract_end)}</div>}<Link href={`/rooms/${r.room_id}?tab=contract`} className="text-xs text-brand-700 hover:underline">{left === null ? "Tạo hợp đồng" : "Gia hạn, phụ lục, chấm dứt"}</Link></td>
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

function ViewTabs({ view }: { view: "now" | "history" }) {
  const cls = (on: boolean) => `rounded-xl px-4 py-2 text-sm font-medium ${on ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-brand-50"}`;
  return (
    <nav className="inline-flex gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-200">
      <Link href="/tenants" className={cls(view === "now")}>Đang ở</Link>
      <Link href="/tenants?view=history" className={cls(view === "history")}>Lịch sử khách đã ở</Link>
    </nav>
  );
}

type H = { room_id: number; code: string; name: string; phone: string | null; people: number; move_in: string | null; move_out: string | null; deposit: number; active: number; files: number };

/** Lịch sử tất cả khách từng ở trong nhà (kể cả khách đã trả phòng), mới nhất trước. */
async function HistoryView({ houseId, houseName }: { houseId: number; houseName: string }) {
  const rows = await all<H>(
    `SELECT r.id room_id, r.code, t.name, t.phone, t.people, t.move_in, t.move_out, t.deposit, t.active,
       (SELECT COUNT(*) FROM room_files f WHERE f.tenant_id=t.id) files
     FROM tenants t JOIN rooms r ON r.id=t.room_id WHERE r.house_id=? ORDER BY t.active ASC, COALESCE(NULLIF(t.move_out,''), '0000') DESC, t.id DESC`, houseId
  );
  const past = rows.filter((r) => !r.active);
  const span = (a: string | null, b: string | null) => {
    if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return "-";
    const d = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
    const m = Math.floor(d / 30.4);
    return m < 1 ? `${d} ngày` : m >= 12 ? `${Math.floor(m / 12)} năm${m % 12 ? ` ${m % 12} tháng` : ""}` : `${m} tháng`;
  };
  return (
    <div className="relative left-1/2 w-[min(calc(100vw-8rem),1700px)] -translate-x-1/2 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Khách thuê</h1>
        <p className="text-sm text-gray-600">{houseName}</p>
      </div>
      <ViewTabs view="history" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={`${cardCls} ${accent.blue}`}><div className="text-xs text-gray-500">Khách đã trả phòng</div><div className="mt-1 text-lg font-bold">{past.length}</div></div>
        <div className={`${cardCls} ${accent.teal}`}><div className="text-xs text-gray-500">Đang ở</div><div className="mt-1 text-lg font-bold">{rows.length - past.length}</div></div>
      </div>
      <section className={`${cardCls} overflow-x-auto`}>
        {past.length === 0 ? <p className="text-sm text-gray-600">Chưa có khách nào trả phòng. Khi bấm &quot;Trả phòng&quot; ở trang phòng, khách sẽ chuyển sang đây.</p> : (
          <table className="w-full min-w-[40rem]">
            <thead><tr><th className={thCls}>Phòng</th><th className={thCls}>Khách</th><th className={thCls}>Ở từ</th><th className={thCls}>Trả phòng</th><th className={thCls}>Thời gian ở</th><th className={`${thCls} text-right`}>Cọc</th><th className={thCls}>Giấy tờ</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {past.map((r, i) => (
                <tr key={i}>
                  <td className={tdCls}><Link href={`/rooms/${r.room_id}?tab=history`} className="font-semibold text-brand-800 hover:underline">{r.code}</Link></td>
                  <td className={tdCls}>{r.name}<div className="text-xs text-gray-500">{r.people} người{r.phone ? ` · ${r.phone}` : ""}</div></td>
                  <td className={tdCls}>{r.move_in ? dateVN(r.move_in) : "?"}</td>
                  <td className={tdCls}>{r.move_out ? dateVN(r.move_out) : "?"}</td>
                  <td className={tdCls}>{span(r.move_in, r.move_out)}</td>
                  <td className={`${tdCls} text-right`}>{vnd(r.deposit ?? 0)}</td>
                  <td className={tdCls}>{r.files ? <Link className="text-brand-700 hover:underline" href={`/rooms/${r.room_id}?tab=info`}>{r.files} file</Link> : <span className="text-gray-400">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
