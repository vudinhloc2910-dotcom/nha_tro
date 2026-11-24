import { MoneyField } from "../../money-field";
import { all, getSettings } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { addHouse, deleteService, saveService, saveSettings } from "../../actions";
import { Flash } from "../../components";
import { btnCls, btnDangerCls, btnGhostCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { parseSharedMeters } from "@/lib/shared-meters";
import { SharedMeterSettings } from "../../shared-meter-settings";

type Svc = { id: number; name: string; type: string; price: number; active: number };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const [s, services, roomRows] = await Promise.all([getSettings(house.id), all<Svc>("SELECT * FROM services WHERE house_id=? ORDER BY id", house.id), all<{ id: number; code: string }>("SELECT id, code FROM rooms WHERE house_id=?", house.id)]);
  const codeOf = new Map(roomRows.map((r) => [Number(r.id), r.code]));
  const sharedItems = parseSharedMeters(s.shared_meters).map((m) => ({
    id: m.id, name: m.name, start: String(m.start),
    parts: m.rooms.filter((r) => codeOf.has(r.roomId)).map((r) => `${codeOf.get(r.roomId)}:${r.parts}`).join(", "),
  }));
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Cài đặt <span className="text-base font-normal text-gray-600">· {house.name}</span></h1>
      <Flash ok={sp.ok} err={sp.err} />

      <section className={cardCls}>
        <h2 className="mb-1 font-semibold">Giá điện, nước và tài khoản nhận tiền của nhà này</h2>
        <p className="mb-3 text-xs text-amber-700">Đơn giá điện, nước ban đầu chỉ là số tạm. Hãy nhập giá thật trước khi tạo hóa đơn.</p>
        <form action={saveSettings} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><label className={labelCls}>Tên nhà</label><input name="house_name" defaultValue={s.house_name} className={inputCls} /></div>
          <div><label className={labelCls}>Số điện thoại chủ trọ (hiện trên hóa đơn)</label><input name="house_phone" defaultValue={s.house_phone ?? ""} className={inputCls} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Địa chỉ nhà trọ (hiện trên hóa đơn)</label><input name="house_address" defaultValue={s.house_address ?? ""} className={inputCls} /></div>
          <div><label className={labelCls}>Giá điện (đ/kWh)</label><MoneyField name="elec_price" defaultValue={s.elec_price} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Cách tính nước</label>
            <select name="water_mode" defaultValue={s.water_mode} className={inputCls}>
              <option value="meter">Theo số m³ (đồng hồ)</option>
              <option value="person">Theo đầu người</option>
            </select>
          </div>
          <div><label className={labelCls}>Giá nước (đ/m³ hoặc đ/người)</label><MoneyField name="water_price" defaultValue={s.water_price} className={inputCls} /></div>
          <div><label className={labelCls}>Mã ngân hàng (VietQR)</label><input name="bank_code" defaultValue={s.bank_code} className={inputCls} placeholder="TCB" /></div>
          <div><label className={labelCls}>Số tài khoản</label><input name="bank_account" defaultValue={s.bank_account} className={inputCls} /></div>
          <div><label className={labelCls}>Tên chủ tài khoản</label><input name="bank_holder" defaultValue={s.bank_holder} className={inputCls} /></div>
          <div><label className={labelCls}>Tiền thuê nhà trả chủ (đ/tháng, quy ra mỗi tháng)</label><MoneyField name="rent_cost_monthly" defaultValue={s.rent_cost_monthly} className={inputCls} /></div>
          <div><label className={labelCls}>Lương quản lý (đ/tháng, 0 = không có)</label><MoneyField name="manager_salary" defaultValue={s.manager_salary} className={inputCls} /></div>
          <div><label className={labelCls}>Chia lãi (VD: Tài:50, Lộc:50)</label><input name="partners" defaultValue={s.partners} className={inputCls} placeholder="Để trống nếu không chia" /></div>
          <div className="sm:col-span-3">
            <label className={labelCls}>Lời nhắn cuối hóa đơn gửi khách</label>
            <textarea name="invoice_note" rows={3} defaultValue={s.invoice_note} className={inputCls} placeholder="Để trống = dùng lời nhắn mặc định: Trân trọng cảm ơn Quý khách đã tin tưởng và thuê phòng tại … Chúc Quý khách và gia đình một tháng mới thật nhiều sức khỏe, bình an và may mắn!" />
            <p className="mt-1 text-xs text-gray-500">Gõ {"{nha}"} để tự chèn tên nhà, {"{sdt}"} để chèn số điện thoại chủ trọ, {"{phong}"} để chèn số phòng. Số điện thoại liên hệ tự hiện thêm một dòng bên dưới nếu anh đã nhập ở trên.</p>
          </div>
          <div><button className={btnCls}>Lưu cài đặt</button></div>
        </form>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Dịch vụ tính vào hóa đơn</h2>
        <p className="mb-3 text-xs text-amber-700">Các dịch vụ ban đầu là số tạm. Sửa theo cách bạn thật sự thu.</p>
        <div className="space-y-3">
          {services.map((v) => (
            <div key={v.id} className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-3">
              <form action={saveService} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={v.id} />
                <div><label className={labelCls}>Tên</label><input name="name" defaultValue={v.name} className={`${inputCls} w-40`} /></div>
                <div>
                  <label className={labelCls}>Cách tính</label>
                  <select name="type" defaultValue={v.type} className={`${inputCls} w-36`}>
                    <option value="room">Theo phòng</option>
                    <option value="person">Theo người</option><option value="vehicle">Theo xe</option>
                  </select>
                </div>
                <div><label className={labelCls}>Giá (đ)</label><div className="w-32"><MoneyField name="price" defaultValue={v.price} className={`${inputCls}`} /></div></div>
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={!!v.active} /> Đang thu</label>
                <button className={btnGhostCls}>Lưu</button>
              </form>
              <form action={deleteService}><input type="hidden" name="id" value={v.id} /><button className={btnDangerCls}>Xóa</button></form>
            </div>
          ))}
        </div>
        <form action={saveService} className="mt-4 flex flex-wrap items-end gap-2">
          <div><label className={labelCls}>Dịch vụ mới</label><input name="name" required className={`${inputCls} w-40`} placeholder="VD: Sạc xe điện" /></div>
          <div>
            <label className={labelCls}>Cách tính</label>
            <select name="type" className={`${inputCls} w-36`}><option value="room">Theo phòng</option><option value="person">Theo người</option><option value="vehicle">Theo xe</option></select>
          </div>
          <div><label className={labelCls}>Giá (đ)</label><div className="w-32"><MoneyField name="price" className={`${inputCls}`} /></div></div>
          <button className={btnCls}>Thêm</button>
        </form>
      </section>

      <section className={cardCls}>
        <h2 className="mb-1 font-semibold">Đồng hồ điện chung</h2>
        <p className="mb-3 text-xs text-gray-500">Dùng cho đồng hồ nhiều phòng cùng dùng (VD nhà vệ sinh chung một tầng). Mỗi tháng anh nhập số mới một lần ở trang Hóa đơn tháng, web chia tiền cho các phòng theo số phần rồi cộng vào tiền điện. VD tầng 2: 201 hai phần, 202 một phần thì viết <b>201:2, 202:1</b>. Tính theo giá điện của nhà.</p>
        <SharedMeterSettings initial={sharedItems} />
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Thêm nhà mới</h2>
        <form action={addHouse} className="grid gap-3 sm:grid-cols-3">
          <div><label className={labelCls}>Tên nhà</label><input name="name" required className={inputCls} placeholder="VD: 15 ngõ 20 Cầu Giấy" /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Địa chỉ</label><input name="address" className={inputCls} /></div>
          <div><button className={btnCls}>Thêm nhà</button></div>
        </form>
      </section>
    </div>
  );
}
