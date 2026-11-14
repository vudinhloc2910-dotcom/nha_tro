import Link from "next/link";
import { notFound } from "next/navigation";
import { all, one } from "@/lib/db";
import { vnd } from "@/lib/format";
import { checkoutTenant, saveRoom, saveTenant } from "../../../actions";
import { Flash } from "../../../components";
import { btnCls, btnDangerCls, cardCls, inputCls, labelCls } from "@/lib/ui";

type Room = { id: number; code: string; rent: number; due_day: number; note: string };
type Tenant = { name: string; phone: string; people: number; move_in: string; deposit: number };

export default async function RoomPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const room = await one<Room>("SELECT * FROM rooms WHERE id=?", Number(id));
  if (!room) notFound();
  const t = await one<Tenant>("SELECT * FROM tenants WHERE room_id=? AND active=1", room.id);
  const past = await all<{ name: string; move_in: string; move_out: string }>(
    "SELECT name, move_in, move_out FROM tenants WHERE room_id=? AND active=0 ORDER BY id DESC", room.id
  );
  return (
    <div className="space-y-5">
      <div><Link href="/rooms" className="text-sm text-brand-700 hover:underline">← Danh sách phòng</Link></div>
      <h1 className="text-xl font-bold">Phòng {room.code}</h1>
      <Flash ok={sp.ok} err={sp.err} />

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Thông tin phòng</h2>
        <form action={saveRoom} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" value={room.id} />
          <div><label className={labelCls}>Giá thuê (đ)</label><input name="rent" type="number" min="0" defaultValue={room.rent} className={inputCls} /></div>
          <div><label className={labelCls}>Hạn đóng (ngày trong tháng)</label><input name="due_day" type="number" min="1" max="31" defaultValue={room.due_day} className={inputCls} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Ghi chú</label><input name="note" defaultValue={room.note ?? ""} className={inputCls} /></div>
          <div><button className={btnCls}>Lưu phòng</button></div>
        </form>
        <p className="mt-2 text-xs text-gray-500">Giá hiện tại: {vnd(room.rent)}. Đổi giá chỉ áp dụng khi tạo/tính lại hóa đơn.</p>
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
          <h2 className="mb-2 font-semibold">Lịch sử khách</h2>
          <ul className="text-sm text-gray-700">
            {past.map((p, i) => <li key={i}>{p.name} — {p.move_in || "?"} đến {p.move_out || "?"}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
