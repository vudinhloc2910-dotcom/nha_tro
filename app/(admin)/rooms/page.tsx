import { currentHouse } from "@/lib/house";
import { vnd } from "@/lib/format";
import { roomTiles } from "@/lib/rooms";
import { addRoom, createRoomsByFloor, importRoomsPaste } from "../../actions";
import { Flash } from "../../components";
import { RoomMap } from "../../room-map";
import { accent, btnCls, cardCls, inputCls, labelCls } from "@/lib/ui";

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const rooms = await roomTiles(house.id);
  const rented = rooms.filter((r) => r.status !== "vacant").length;
  const vacant = rooms.length - rented;
  const debtRooms = rooms.filter((r) => r.status === "debt" || r.status === "overdue");
  const debt = debtRooms.reduce((a, r) => a + r.debt, 0);
  const potential = rooms.filter((r) => r.status === "vacant").reduce((a, r) => a + r.rent, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Nhà & phòng</h1>
        <p className="text-sm text-gray-600">{house.name}{house.address ? ` · ${house.address}` : ""}</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat c="blue" label="Tổng số phòng" value={String(rooms.length)} />
        <Stat c="teal" label="Đang thuê" value={`${rented}/${rooms.length}`} sub={rooms.length ? `${Math.round((rented / rooms.length) * 100)}% lấp đầy` : ""} />
        <Stat c="amber" label="Phòng trống" value={String(vacant)} sub={vacant ? `mất ${vnd(potential)}/tháng` : "đã kín phòng"} />
        <Stat c="rose" label="Nợ tiền" value={String(debtRooms.length)} sub={debt ? vnd(debt) : "không có nợ"} />
      </div>

      {rooms.length === 0 ? (
        <section className={`${cardCls} text-center`}>
          <p className="font-semibold">Nhà này chưa có phòng nào</p>
          <p className="mt-1 text-sm text-gray-600">Dùng một trong hai cách bên dưới: tạo nhanh theo tầng, hoặc dán danh sách từ Excel.</p>
        </section>
      ) : (
        <RoomMap rooms={rooms} />
      )}

      <section className={cardCls}>
        <h2 className="mb-1 font-semibold">Tạo nhanh nhiều phòng theo tầng</h2>
        <p className="mb-3 text-xs text-gray-500">Ví dụ từ tầng 1 đến tầng 3, mỗi tầng 4 phòng sẽ tạo 101 đến 104, 201 đến 204, 301 đến 304. Phòng đã có thì bỏ qua.</p>
        <form action={createRoomsByFloor} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div><label className={labelCls}>Từ tầng</label><input name="from" type="number" min="1" max="40" defaultValue={1} className={inputCls} /></div>
          <div><label className={labelCls}>Đến tầng</label><input name="to" type="number" min="1" max="40" defaultValue={3} className={inputCls} /></div>
          <div><label className={labelCls}>Số phòng mỗi tầng</label><input name="per" type="number" min="1" max="40" defaultValue={4} className={inputCls} /></div>
          <div><label className={labelCls}>Giá thuê chung (đ)</label><input name="rent" type="number" min="0" className={inputCls} placeholder="Sửa lại từng phòng sau" /></div>
          <div className="flex items-end"><button className={`${btnCls} w-full`}>Tạo phòng</button></div>
        </form>
      </section>

      <section className={cardCls}>
        <h2 className="mb-1 font-semibold">Nhập từ Excel (dán bảng)</h2>
        <p className="mb-3 text-xs text-gray-500">Trong Excel, bôi đen các ô theo thứ tự cột <b>Phòng · Tên khách · Số điện thoại · Số người · Giá thuê</b>, bấm Ctrl+C rồi dán vào ô dưới. Dòng tiêu đề tự bỏ qua. Phòng đã có thì cập nhật giá và khách.</p>
        <form action={importRoomsPaste} className="space-y-3">
          <textarea name="table" rows={5} placeholder={"101\tNguyễn Văn A\t0912345678\t2\t3500000\n102\tTrần Thị B\t0987654321\t1\t3200000"} className={`${inputCls} font-mono`} />
          <button className={btnCls}>Nhập vào nhà này</button>
        </form>
      </section>

      <details className={cardCls}>
        <summary className="cursor-pointer font-semibold">Thêm một phòng</summary>
        <form action={addRoom} className="mt-3 grid gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>Số phòng</label><input name="code" required className={inputCls} /></div>
          <div><label className={labelCls}>Giá thuê (đ)</label><input name="rent" type="number" min="0" className={inputCls} /></div>
          <div><label className={labelCls}>Ngày đóng tiền</label><input name="due_day" type="number" min="1" max="31" defaultValue={15} className={inputCls} /></div>
          <div className="flex items-end"><button className={btnCls}>Thêm</button></div>
        </form>
      </details>
    </div>
  );
}

function Stat({ label, value, sub, c }: { label: string; value: string; sub?: string; c: keyof typeof accent }) {
  return (
    <div className={`${cardCls} ${accent[c]}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}
