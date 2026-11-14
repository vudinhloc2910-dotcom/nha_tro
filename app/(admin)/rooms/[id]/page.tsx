import Link from "next/link";
import { notFound } from "next/navigation";
import { all, one } from "@/lib/db";
import { currentMonth, dateVN, monthLabel, statusOf, vnd } from "@/lib/format";
import { loadMonth } from "@/lib/monthdata";
import { addRoomExtra, checkoutTenant, saveRoom, saveTenant } from "../../../actions";
import { Flash, StatusBadge } from "../../../components";
import { RoomEditButton } from "../../../room-editor";
import { accent, btnCls, btnDangerCls, cardCls, inputCls, labelCls, tdCls, thCls } from "@/lib/ui";

type Room = { id: number; house_id: number; code: string; rent: number; due_day: number; note: string };
type Tenant = { name: string; phone: string; people: number; move_in: string; deposit: number };
type Inv = { id: number; month: string; total: number; due_date: string; locked: number; paid: number };
type Rd = { month: string; elec_old: number; elec_new: number; water_old: number; water_new: number };

const TABS = [["info", "Thông tin chung"], ["price", "Giá và phí"], ["history", "Lịch sử"]] as const;

export default async function RoomPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t[0] === sp.tab) ? sp.tab! : "info";
  const room = await one<Room>("SELECT * FROM rooms WHERE id=?", Number(id));
  if (!room) notFound();
  const t = await one<Tenant>("SELECT * FROM tenants WHERE room_id=? AND active=1", room.id);
  const past = await all<{ name: string; move_in: string; move_out: string }>(
    "SELECT name, move_in, move_out FROM tenants WHERE room_id=? AND active=0 ORDER BY id DESC", room.id
  );
  const invoices = await all<Inv>(
    `SELECT i.id, i.month, i.total, i.due_date, i.locked, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
     FROM invoices i WHERE i.room_id=? ORDER BY i.month DESC`, room.id
  );
  const debt = invoices.reduce((a, i) => a + Math.max(0, i.total - i.paid), 0);
  const month = currentMonth();
  const md = await loadMonth(room.house_id, month);
  const view = md.rooms.find((r) => r.id === room.id);
  const house = await one<{ name: string }>("SELECT name FROM houses WHERE id=?", room.house_id);

  return (
    <div className="space-y-4">
      <div><Link href="/rooms" className="text-sm text-brand-700 hover:underline">← Sơ đồ phòng</Link></div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Phòng {room.code}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${!t ? "bg-gray-100 text-gray-700" : debt > 0 ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{!t ? "Phòng trống" : debt > 0 ? "Còn nợ" : "Đang thuê"}</span>
        <span className="text-sm text-gray-500">{house?.name}</span>
        {view && <span className="ml-auto"><RoomEditButton room={view} month={month} services={md.services} /></span>}
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={`${cardCls} ${accent.blue}`}><div className="text-xs text-gray-500">Giá thuê</div><div className="mt-1 text-lg font-bold">{vnd(room.rent)}</div></div>
        <div className={`${cardCls} ${accent.teal}`}><div className="text-xs text-gray-500">Khách / số người</div><div className="mt-1 truncate text-lg font-bold">{t ? `${t.name}` : "—"}</div><div className="text-xs text-gray-500">{t ? `${t.people} người${t.phone ? ` · ${t.phone}` : ""}` : "Chưa có khách"}</div></div>
        <div className={`${cardCls} ${accent.violet}`}><div className="text-xs text-gray-500">Tiền cọc</div><div className="mt-1 text-lg font-bold">{vnd(t?.deposit ?? 0)}</div></div>
        <div className={`${cardCls} ${accent.rose}`}><div className="text-xs text-gray-500">Còn nợ</div><div className={`mt-1 text-lg font-bold ${debt > 0 ? "text-red-700" : "text-green-700"}`}>{vnd(debt)}</div></div>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-200">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/rooms/${room.id}?tab=${k}`} className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-center text-sm font-medium ${tab === k ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-brand-50"}`}>{l}</Link>
        ))}
      </nav>

      {tab === "info" && (
        <>
          <section className={cardCls}>
            <h2 className="mb-3 font-semibold">Thông tin phòng</h2>
            <form action={saveRoom} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={room.id} />
              <div><label className={labelCls}>Giá thuê (đ)</label><input name="rent" type="number" min="0" defaultValue={room.rent} className={inputCls} /></div>
              <div><label className={labelCls}>Hạn đóng (ngày trong tháng)</label><input name="due_day" type="number" min="1" max="31" defaultValue={room.due_day} className={inputCls} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Ghi chú</label><input name="note" defaultValue={room.note ?? ""} className={inputCls} /></div>
              <div><button className={btnCls}>Lưu phòng</button></div>
            </form>
          </section>

          <section className={cardCls}>
            <h2 className="mb-3 font-semibold">{t ? "Khách đang thuê" : "Phòng trống — thêm khách mới"}</h2>
            <form action={saveTenant} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="room_id" value={room.id} />
              <div><label className={labelCls}>Họ tên</label><input name="name" required defaultValue={t?.name ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Số điện thoại</label><input name="phone" defaultValue={t?.phone ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Số người ở</label><input name="people" type="number" min="1" defaultValue={t?.people ?? 1} className={inputCls} /></div>
              <div><label className={labelCls}>Ngày vào</label><input name="move_in" type="date" defaultValue={t?.move_in ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Tiền cọc (đ)</label><input name="deposit" type="number" min="0" defaultValue={t?.deposit ?? 0} className={inputCls} /></div>
              <div className="flex items-end"><button className={btnCls}>{t ? "Lưu khách" : "Thêm khách"}</button></div>
            </form>
            {t && (
              <form action={checkoutTenant} className="mt-4 border-t border-gray-100 pt-3">
                <input type="hidden" name="room_id" value={room.id} />
                <button className={btnDangerCls}>Trả phòng</button>
                <span className="ml-2 text-xs text-gray-500">Khách chuyển sang lịch sử, phòng thành trống. Nhớ tính tiền cọc.</span>
              </form>
            )}
          </section>

          {past.length > 0 && (
            <section className={cardCls}>
              <h2 className="mb-2 font-semibold">Khách đã ở</h2>
              <ul className="text-sm text-gray-700">
                {past.map((p, i) => <li key={i}>{p.name} — {p.move_in || "?"} đến {p.move_out || "?"}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === "price" && (
        <section className={cardCls}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Giá và phí đang áp dụng cho phòng {room.code}</h2>
            {view && <RoomEditButton room={view} month={month} services={md.services} label="Đổi giá riêng" />}
          </div>
          {!view ? <p className="text-sm text-gray-600">Phòng chưa có khách nên chưa có bảng giá. Thêm khách ở tab Thông tin chung.</p> : (
            <table className="w-full">
              <thead><tr><th className={thCls}>Khoản</th><th className={`${thCls} text-right`}>Đơn giá</th><th className={thCls}>Áp dụng</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                <tr><td className={tdCls}>Tiền thuê phòng</td><td className={`${tdCls} text-right`}>{vnd(room.rent)}</td><td className={`${tdCls} text-xs text-gray-500`}>mỗi tháng</td></tr>
                <tr><td className={tdCls}>Điện</td><td className={`${tdCls} text-right`}>{vnd(view.input.elecPrice)}/kWh</td><td className={`${tdCls} text-xs`}>{view.prefs.elecPrice !== null ? <Tag own /> : <Tag />}</td></tr>
                <tr><td className={tdCls}>Nước</td><td className={`${tdCls} text-right`}>{vnd(view.input.waterPrice)}/{view.input.waterMode === "person" ? "người" : "m³"}</td><td className={`${tdCls} text-xs`}>{view.prefs.waterPrice !== null ? <Tag own /> : <Tag />}</td></tr>
                {md.services.map((s) => {
                  const p = view.prefs.svc[s.id];
                  return (
                    <tr key={s.id}>
                      <td className={tdCls}>{s.name}</td>
                      <td className={`${tdCls} text-right`}>{p?.off ? <span className="text-gray-400">Không thu</span> : `${vnd(p?.unit ?? s.price)}${s.type === "person" ? "/người" : "/phòng"}`}</td>
                      <td className={`${tdCls} text-xs`}>{p?.off || p?.unit !== null ? <Tag own /> : <Tag />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "history" && <History roomId={room.id} invoices={invoices} />}
    </div>
  );
}

function Tag({ own }: { own?: boolean }) {
  return own
    ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">Giá riêng của phòng</span>
    : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">Giá chung của nhà</span>;
}

async function History({ roomId, invoices }: { roomId: number; invoices: Inv[] }) {
  const readings = await all<Rd>("SELECT month, elec_old, elec_new, water_old, water_new FROM readings WHERE room_id=? ORDER BY month DESC LIMIT 12", roomId);
  const chart = [...readings].reverse().map((r) => ({ m: r.month, e: Math.max(0, r.elec_new - r.elec_old) }));
  const max = Math.max(1, ...chart.map((c) => c.e));
  return (
    <>
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Điện dùng 12 tháng gần nhất (kWh)</h2>
        {chart.length === 0 ? <p className="text-sm text-gray-500">Chưa có chỉ số điện nước.</p> : (
          <div className="flex h-36 items-end gap-1.5">
            {chart.map((c) => (
              <div key={c.m} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel(c.m)}: ${Math.round(c.e)} kWh`}>
                <span className="text-[10px] text-gray-500">{Math.round(c.e)}</span>
                <div className="w-full rounded-t-md bg-sky-300" style={{ height: `${Math.max(4, (c.e / max) * 96)}px` }} />
                <span className="text-[10px] text-gray-500">{c.m.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${cardCls} overflow-x-auto`}>
        <h2 className="mb-3 font-semibold">Hóa đơn của phòng</h2>
        {invoices.length === 0 ? <p className="text-sm text-gray-500">Chưa có hóa đơn nào.</p> : (
          <table className="w-full">
            <thead><tr><th className={thCls}>Tháng</th><th className={thCls}>Hạn</th><th className={`${thCls} text-right`}>Tổng</th><th className={`${thCls} text-right`}>Đã thu</th><th className={thCls}>Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className={tdCls}><Link className="font-medium text-brand-700 hover:underline" href={`/invoices/${i.id}`}>{monthLabel(i.month)}</Link></td>
                  <td className={tdCls}>{dateVN(i.due_date)}</td>
                  <td className={`${tdCls} text-right`}>{vnd(i.total)}</td>
                  <td className={`${tdCls} text-right`}>{vnd(i.paid)}</td>
                  <td className={tdCls}><StatusBadge status={statusOf(i.total, i.paid, i.due_date)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={`${cardCls} overflow-x-auto`}>
        <h2 className="mb-3 font-semibold">Lịch sử chỉ số điện nước</h2>
        {readings.length === 0 ? <p className="text-sm text-gray-500">Chưa có chỉ số.</p> : (
          <table className="w-full">
            <thead><tr><th className={thCls}>Tháng</th><th className={`${thCls} text-right`}>Điện cũ</th><th className={`${thCls} text-right`}>Điện mới</th><th className={`${thCls} text-right`}>Dùng</th><th className={`${thCls} text-right`}>Nước cũ</th><th className={`${thCls} text-right`}>Nước mới</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {readings.map((r) => (
                <tr key={r.month}>
                  <td className={tdCls}>{monthLabel(r.month)}</td>
                  <td className={`${tdCls} text-right`}>{r.elec_old}</td><td className={`${tdCls} text-right`}>{r.elec_new}</td>
                  <td className={`${tdCls} text-right font-medium`}>{Math.round((r.elec_new - r.elec_old) * 10) / 10} kWh</td>
                  <td className={`${tdCls} text-right`}>{r.water_old}</td><td className={`${tdCls} text-right`}>{r.water_new}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {invoices.length > 0 && (
        <section className={cardCls}>
          <h2 className="mb-1 font-semibold">Thu lẻ: thêm một khoản vào hóa đơn</h2>
          <p className="mb-3 text-xs text-gray-500">Ví dụ phí hư hỏng, tiền cọc thêm, phí gửi xe. Khoản này cộng vào hóa đơn tháng đã chọn và tính lại tổng. Dùng số âm để giảm.</p>
          <form action={addRoomExtra} className="grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="room_id" value={roomId} />
            <div><label className={labelCls}>Hóa đơn tháng</label>
              <select name="month" className={inputCls} defaultValue={invoices[0].month}>{invoices.map((i) => <option key={i.id} value={i.month}>{monthLabel(i.month)}</option>)}</select></div>
            <div className="sm:col-span-2"><label className={labelCls}>Tên khoản</label><input name="name" required className={inputCls} placeholder="VD: Sửa khóa cửa" /></div>
            <div><label className={labelCls}>Số tiền (đ)</label><input name="amount" type="number" required className={inputCls} /></div>
            <div className="flex items-end"><button className={btnCls}>Thêm khoản</button></div>
          </form>
        </section>
      )}
    </>
  );
}
