import { MoneyField } from "../../../money-field";
import Link from "next/link";
import { DateVN } from "../../../date-input";
import { notFound } from "next/navigation";
import { all, readAll } from "@/lib/db";
import { currentMonth, dateVN, monthLabel, statusOf, vnd } from "@/lib/format";
import { loadMonth } from "@/lib/monthdata";
import { addRoomExtra, addRoomService, addVehicle, checkoutTenant, deleteRoom, deleteService, deleteVehicle, saveRoom, saveTenant } from "../../../actions";
import { computeInvoice, svcUnitLabel } from "@/lib/calc";
import { Flash, StatusBadge } from "../../../components";
import { RoomEditButton } from "../../../room-editor";
import { RoomFiles, type RoomFile } from "../../../room-files";
import { accent, btnCls, btnDangerCls, cardCls, inputCls, labelCls, tdCls, thCls } from "@/lib/ui";

type Room = { id: number; house_id: number; code: string; rent: number; due_day: number; note: string; floor_label: string; kind: string };
type Tenant = { name: string; phone: string; people: number; move_in: string; deposit: number; contract_end: string | null; residence_done: number };
type Vehicle = { id: number; kind: string; plate: string; note: string };
type Inv = { id: number; month: string; total: number; due_date: string; locked: number; state: string; paid: number };
type StayRow = { id: number; name: string; phone: string; people: number; move_in: string; move_out: string; deposit: number; active: number; files: number; bills: number; billed: number };
type Rd = { month: string; elec_old: number; elec_new: number; water_old: number; water_new: number };

const TABS = [["info", "Thông tin chung"], ["price", "Giá và phí"], ["history", "Lịch sử"]] as const;

export default async function RoomPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t[0] === sp.tab) ? sp.tab! : "info";
  const rid = Number(id);
  const month = currentMonth();
  // Một lượt gọi database cho mọi dữ liệu của phòng
  const [roomR, tenantR, pastR, invR, vehR, fileR, allTenR] = await readAll([
    { sql: "SELECT * FROM rooms WHERE id=?", args: [rid] },
    { sql: "SELECT * FROM tenants WHERE room_id=? AND active=1", args: [rid] },
    { sql: "SELECT name, move_in, move_out FROM tenants WHERE room_id=? AND active=0 ORDER BY id DESC", args: [rid] },
    { sql: `SELECT i.id, i.month, i.total, i.due_date, i.locked, i.state, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
            FROM invoices i WHERE i.room_id=? ORDER BY i.month DESC`, args: [rid] },
    { sql: "SELECT id, kind, plate, note FROM vehicles WHERE room_id=? ORDER BY id", args: [rid] },
    { sql: `SELECT f.id, f.kind, f.name, f.mime, f.size, f.created, f.tenant_id, t.name tname FROM room_files f
            LEFT JOIN tenants t ON t.id=f.tenant_id WHERE f.room_id=? ORDER BY f.id DESC`, args: [rid] },
    { sql: `SELECT t.id, t.name, t.phone, t.people, t.move_in, t.move_out, t.deposit, t.active,
              (SELECT COUNT(*) FROM room_files f WHERE f.tenant_id=t.id) files,
              (SELECT COUNT(*) FROM invoices i WHERE i.room_id=t.room_id AND i.tenant_name=t.name) bills,
              (SELECT COALESCE(SUM(i.total),0) FROM invoices i WHERE i.room_id=t.room_id AND i.tenant_name=t.name) billed
            FROM tenants t WHERE t.room_id=? ORDER BY t.active DESC, t.id DESC`, args: [rid] },
  ]);
  const room = roomR[0] as Room | undefined;
  if (!room) notFound();
  const t = tenantR[0] as Tenant | undefined;
  const past = pastR as { name: string; move_in: string; move_out: string }[];
  const invoices = invR as Inv[];
  const vehicles = vehR as Vehicle[];
  const files = fileR as RoomFile[];
  const stays = allTenR as StayRow[];
  const debt = invoices.reduce((a, i) => a + Math.max(0, i.total - i.paid), 0);
  const md = await loadMonth(room.house_id, month);
  const view = md.rooms.find((r) => r.id === room.id);

  return (
    <div className="space-y-4">
      <div><Link href="/rooms" className="text-sm text-brand-700 hover:underline">← Sơ đồ phòng</Link></div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Phòng {room.code}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${!t ? "bg-gray-100 text-gray-700" : debt > 0 ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{!t ? "Phòng trống" : debt > 0 ? "Còn nợ" : "Đang thuê"}</span>
        <span className="text-sm text-gray-500">{md.settings.house_name}</span>
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
              <div className="sm:col-span-2"><label className={labelCls}>Tên / số phòng</label><input name="code" required defaultValue={room.code} className={inputCls} placeholder="VD: 201, Mặt bằng 1, Tầng lửng" /></div>
              <div><label className={labelCls}>Tầng / khu</label><input name="floor_label" defaultValue={room.floor_label ?? ""} list="floor-suggest" className={inputCls} placeholder="Để trống = tự theo số phòng" /></div>
              <div><label className={labelCls}>Loại</label><input name="kind" defaultValue={room.kind ?? ""} list="kind-suggest" className={inputCls} placeholder="VD: Phòng trọ" /></div>
              <div><label className={labelCls}>Giá thuê (đ)</label><MoneyField name="rent" defaultValue={room.rent} className={inputCls} /></div>
              <div><label className={labelCls}>Ngày đóng tiền = ngày bắt đầu kỳ thu</label><input name="due_day" type="number" min="1" max="31" defaultValue={room.due_day} className={inputCls} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Ghi chú</label><input name="note" defaultValue={room.note ?? ""} className={inputCls} /></div>
              <div><button className={btnCls}>Lưu phòng</button></div>
            </form>
            <datalist id="floor-suggest"><option value="Tầng hầm" /><option value="Tầng trệt" /><option value="Tầng lửng" /><option value="Mặt bằng kinh doanh" /><option value="Sân thượng" /></datalist>
            <datalist id="kind-suggest"><option value="Phòng trọ" /><option value="Mặt bằng kinh doanh" /><option value="Kho" /><option value="Văn phòng" /><option value="Phòng chung" /></datalist>
          </section>

          <section className={cardCls}>
            <h2 className="mb-3 font-semibold">{t ? "Khách đang thuê" : "Phòng trống — thêm khách mới"}</h2>
            <form action={saveTenant} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="room_id" value={room.id} />
              <div><label className={labelCls}>Họ tên</label><input name="name" required defaultValue={t?.name ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Số điện thoại</label><input name="phone" defaultValue={t?.phone ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Số người ở</label><input name="people" type="number" min="1" defaultValue={t?.people ?? 1} className={inputCls} /></div>
              <div><label className={labelCls}>Ngày vào</label><DateVN name="move_in" defaultValue={t?.move_in ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Tiền cọc (đ)</label><MoneyField name="deposit" defaultValue={t?.deposit ?? 0} className={inputCls} /></div>
              <div><label className={labelCls}>Hợp đồng đến ngày</label><DateVN name="contract_end" defaultValue={t?.contract_end ?? ""} className={inputCls} /></div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="residence_done" defaultChecked={!!t?.residence_done} />Đã khai tạm trú</label>
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

          {t && (
            <section className={cardCls}>
              <h2 className="mb-2 font-semibold">Phương tiện của phòng</h2>
              {vehicles.length === 0 ? <p className="mb-3 text-sm text-gray-500">Chưa ghi phương tiện nào.</p> : (
                <ul className="mb-3 divide-y divide-gray-100 text-sm">
                  {vehicles.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                      <span><b>{v.kind}</b>{v.plate ? ` · ${v.plate}` : ""}{v.note ? <span className="text-gray-500"> · {v.note}</span> : null}</span>
                      <form action={deleteVehicle}><input type="hidden" name="room_id" value={room.id} /><input type="hidden" name="id" value={v.id} /><button className={btnDangerCls}>Xóa</button></form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addVehicle} className="grid gap-3 sm:grid-cols-5">
                <input type="hidden" name="room_id" value={room.id} />
                <div><label className={labelCls}>Loại xe</label><select name="kind" className={inputCls}><option>Xe máy</option><option>Xe điện</option><option>Xe đạp</option><option>Ô tô</option></select></div>
                <div><label className={labelCls}>Biển số</label><input name="plate" className={inputCls} placeholder="29A1-123.45" /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Ghi chú</label><input name="note" className={inputCls} placeholder="VD: có sạc điện" /></div>
                <div className="flex items-end"><button className={btnCls}>Thêm xe</button></div>
              </form>
            </section>
          )}

          <section className={cardCls}>
            <h2 className="mb-1 font-semibold">Giấy tờ: ảnh CCCD, hợp đồng</h2>
            <p className="mb-3 text-xs text-gray-500">Chụp hoặc chọn ảnh CCCD (mặt trước, mặt sau), ảnh/PDF hợp đồng của khách đang ở phòng này. Chỉ chủ trọ đăng nhập mới xem được.</p>
            <RoomFiles roomId={room.id} files={files} />
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <h2 className="mb-1 font-semibold text-red-800">Xóa phòng này</h2>
            <p className="mb-3 text-xs text-gray-600">{invoices.length > 0 ? `Phòng đã có ${invoices.length} hóa đơn. Xóa sẽ mất cả khách, hóa đơn, chỉ số điện nước và lịch sử thu tiền của phòng, không khôi phục được.` : "Phòng chưa có hóa đơn nào, xóa không mất dữ liệu thu tiền."}</p>
            <form action={deleteRoom} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={room.id} />
              {invoices.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="1" required />Tôi hiểu sẽ mất lịch sử của phòng {room.code}</label>}
              <button className={btnDangerCls}>Xóa phòng {room.code}</button>
            </form>
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
        <>
          <section className={cardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Giá và phí của phòng {room.code}</h2>
                <p className="text-xs text-gray-500">Gồm tiền phòng, điện, nước và các khoản phí khác (dịch vụ, máy giặt, gửi xe, wifi...). Cột &quot;Dự kiến&quot; là số tiền mỗi tháng nếu dùng đúng như hiện tại.</p>
              </div>
              {view && <RoomEditButton room={view} month={month} services={md.services} label="Sửa giá riêng và số đầu vào" />}
            </div>
            {!view ? <p className="text-sm text-gray-600">Phòng chưa có khách nên chưa có bảng giá. Thêm khách ở tab Thông tin chung.</p> : (() => {
              const est = computeInvoice({ ...view.input, elecNew: view.input.elecOld, waterNew: view.input.waterOld, extras: [], discount: 0, debt: 0 });
              const svcAmt = (name: string) => est.lines.find((l) => l.label === name)?.amount ?? 0;
              const mine = md.services.filter((s) => !s.roomId || s.roomId === room.id);
              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem]">
                    <thead><tr><th className={thCls}>Khoản</th><th className={thCls}>Cách tính</th><th className={`${thCls} text-right`}>Đơn giá</th><th className={`${thCls} text-right`}>Dự kiến/tháng</th><th className={thCls}>Áp dụng</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr><td className={tdCls}>Tiền thuê phòng</td><td className={`${tdCls} text-xs text-gray-500`}>mỗi tháng</td><td className={`${tdCls} text-right`}>{vnd(room.rent)}</td><td className={`${tdCls} text-right font-medium`}>{vnd(room.rent)}</td><td className={`${tdCls} text-xs`}><Tag /></td></tr>
                      <tr><td className={tdCls}>Điện<div className="text-xs text-gray-400">Số đầu vào: {view.start.elec}</div></td><td className={`${tdCls} text-xs text-gray-500`}>theo số kWh</td><td className={`${tdCls} text-right`}>{vnd(view.input.elecPrice)}/kWh</td><td className={`${tdCls} text-right text-gray-400`}>theo chỉ số</td><td className={`${tdCls} text-xs`}>{view.prefs.elecPrice !== null ? <Tag own /> : <Tag />}</td></tr>
                      <tr><td className={tdCls}>Nước<div className="text-xs text-gray-400">Số đầu vào: {view.start.water}</div></td><td className={`${tdCls} text-xs text-gray-500`}>{view.input.waterMode === "person" ? "theo người" : "theo m³"}</td><td className={`${tdCls} text-right`}>{vnd(view.input.waterPrice)}/{view.input.waterMode === "person" ? "người" : "m³"}</td><td className={`${tdCls} text-right ${view.input.waterMode === "person" ? "font-medium" : "text-gray-400"}`}>{view.input.waterMode === "person" ? vnd(svcAmt("Tiền nước")) : "theo chỉ số"}</td><td className={`${tdCls} text-xs`}>{view.prefs.waterPrice !== null ? <Tag own /> : <Tag />}</td></tr>
                      {mine.map((s) => {
                        const p = view.prefs.svc[s.id];
                        const off = !!p?.off;
                        return (
                          <tr key={s.id}>
                            <td className={tdCls}>{s.name}{s.type === "vehicle" && <div className="text-xs text-gray-400">{view.input.vehicles} xe đang ghi</div>}</td>
                            <td className={`${tdCls} text-xs text-gray-500`}>{s.type === "person" ? "theo người" : s.type === "vehicle" ? "theo xe" : "theo phòng"}</td>
                            <td className={`${tdCls} text-right`}>{off ? <span className="text-gray-400">Không thu</span> : `${vnd(p?.unit ?? s.price)}${svcUnitLabel(s)}`}</td>
                            <td className={`${tdCls} text-right font-medium`}>{off ? "—" : vnd(svcAmt(s.name))}</td>
                            <td className={`${tdCls} text-xs`}>
                              <div className="flex flex-wrap items-center gap-2">
                                {s.roomId ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">Chỉ phòng này</span> : off || p?.unit !== null ? <Tag own /> : <Tag />}
                                {s.roomId ? <form action={deleteService}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="back" value={`/rooms/${room.id}`} /><button className="text-red-600 hover:underline">Xóa</button></form> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-brand-50 font-bold"><td className={tdCls} colSpan={3}>Cộng các khoản cố định (chưa gồm điện, nước theo chỉ số)</td><td className={`${tdCls} text-right`}>{vnd(est.total)}</td><td className={tdCls} /></tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>

          <section className={cardCls}>
            <h2 className="mb-1 font-semibold">Thêm khoản phí cho phòng</h2>
            <p className="mb-3 text-xs text-gray-500">Ví dụ Wifi, Máy giặt, Gửi xe (tính theo số xe đã ghi ở tab Thông tin chung), Vệ sinh và rác, Sạc xe điện. Chọn &quot;Chỉ phòng này&quot; nếu chỉ phòng này phải đóng.</p>
            <form action={addRoomService} className="grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="room_id" value={room.id} />
              <div className="sm:col-span-2"><label className={labelCls}>Tên khoản phí</label><input name="name" required list="svc-suggest" className={inputCls} placeholder="VD: Gửi xe" /></div>
              <div><label className={labelCls}>Cách tính</label><select name="type" className={inputCls}><option value="room">Theo phòng</option><option value="person">Theo người</option><option value="vehicle">Theo xe</option></select></div>
              <div><label className={labelCls}>Đơn giá (đ)</label><MoneyField name="price" required className={inputCls} /></div>
              <div><label className={labelCls}>Áp dụng cho</label><select name="scope" className={inputCls}><option value="room">Chỉ phòng này</option><option value="house">Tất cả phòng trong nhà</option></select></div>
              <div className="flex items-end"><button className={btnCls}>Thêm khoản</button></div>
            </form>
            <datalist id="svc-suggest"><option value="Wifi" /><option value="Máy giặt" /><option value="Gửi xe" /><option value="Vệ sinh, rác" /><option value="Sạc xe điện" /><option value="Điều hòa" /><option value="Thang máy" /><option value="Truyền hình cáp" /></datalist>
          </section>
        </>
      )}

      {tab === "history" && <History roomId={room.id} invoices={invoices} stays={stays} />}
    </div>
  );
}

/** "8 tháng", "1 năm 2 tháng"... từ ngày vào đến ngày ra (hoặc hôm nay). */
function stayLabel(from: string, to: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return "-";
  const a = Date.parse(from), b = /^\d{4}-\d{2}-\d{2}$/.test(to) ? Date.parse(to) : Date.now();
  const days = Math.max(0, Math.round((b - a) / 86400000));
  const months = Math.floor(days / 30.4);
  if (months < 1) return `${days} ngày`;
  const y = Math.floor(months / 12), m = months % 12;
  return y ? `${y} năm${m ? ` ${m} tháng` : ""}` : `${months} tháng`;
}

function Tag({ own }: { own?: boolean }) {
  return own
    ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">Giá riêng của phòng</span>
    : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">Giá chung của nhà</span>;
}

async function History({ roomId, invoices, stays }: { roomId: number; invoices: Inv[]; stays: StayRow[] }) {
  const readings = await all<Rd>("SELECT month, elec_old, elec_new, water_old, water_new FROM readings WHERE room_id=? ORDER BY month DESC LIMIT 12", roomId);
  const chart = [...readings].reverse().map((r) => ({ m: r.month, e: Math.max(0, r.elec_new - r.elec_old) }));
  const max = Math.max(1, ...chart.map((c) => c.e));
  return (
    <>
      <section className={`${cardCls} overflow-x-auto`}>
        <h2 className="mb-3 font-semibold">Lịch sử khách thuê phòng này</h2>
        {stays.length === 0 ? <p className="text-sm text-gray-500">Phòng chưa có khách nào.</p> : (
          <table className="w-full min-w-[34rem]">
            <thead><tr><th className={thCls}>Khách</th><th className={thCls}>Ở từ</th><th className={thCls}>Đến</th><th className={thCls}>Thời gian</th><th className={`${thCls} text-right`}>Cọc</th><th className={`${thCls} text-right`}>Hóa đơn</th><th className={thCls}>Giấy tờ</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {stays.map((s) => (
                <tr key={s.id}>
                  <td className={tdCls}>{s.name}{s.active ? <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">Đang ở</span> : null}<div className="text-xs text-gray-500">{s.people} người{s.phone ? ` · ${s.phone}` : ""}</div></td>
                  <td className={tdCls}>{s.move_in ? dateVN(s.move_in) : "?"}</td>
                  <td className={tdCls}>{s.active ? "—" : s.move_out ? dateVN(s.move_out) : "?"}</td>
                  <td className={tdCls}>{stayLabel(s.move_in, s.active ? "" : s.move_out)}</td>
                  <td className={`${tdCls} text-right`}>{vnd(s.deposit ?? 0)}</td>
                  <td className={`${tdCls} text-right`}>{s.bills ? `${s.bills} kỳ · ${vnd(s.billed)}` : "-"}</td>
                  <td className={tdCls}>{s.files ? <Link className="text-brand-700 hover:underline" href={`/rooms/${roomId}?tab=info`}>{s.files} file</Link> : <span className="text-gray-400">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
                  <td className={tdCls}><StatusBadge status={statusOf(i.total, i.paid, i.due_date, i.state)} /></td>
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
            <div><label className={labelCls}>Số tiền (đ)</label><MoneyField name="amount" allowNegative required className={inputCls} /></div>
            <div className="flex items-end"><button className={btnCls}>Thêm khoản</button></div>
          </form>
        </section>
      )}
    </>
  );
}
