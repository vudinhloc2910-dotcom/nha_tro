"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveRoomProfile } from "./actions";
import type { RoomView } from "@/lib/monthdata";

type Svc = { id: number; name: string; type: "room" | "person" | "vehicle"; price: number; roomId: number | null };
const s2 = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

/** Nút mở ô sửa phòng (dùng ở trang chi tiết phòng). */
export function RoomEditButton({ room, month, services, label }: { room: RoomView; month: string; services: Svc[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100">{label ?? "Sửa thông tin và giá riêng"}</button>
      {open && <RoomEditor room={room} month={month} services={services} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

/** Ô "Sửa": toàn bộ thông tin cố định của một phòng (tên, điện thoại, giá phòng, giá riêng, dịch vụ riêng...). */
export function RoomEditor({ room, month, services, onClose, onSaved }: { room: RoomView; month: string; services: Svc[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: room.code, tenantName: room.tenantName, phone: room.phone, people: String(room.tenantPeople), rent: String(room.rent),
    dueDay: String(room.dueDay), note: room.note, elecPrice: s2(room.prefs.elecPrice), waterPrice: s2(room.prefs.waterPrice),
    elecStart: String(room.start.elec), waterStart: String(room.start.water),
  });
  const [svc, setSvc] = useState<Record<number, { unit: string; off: boolean }>>(() =>
    Object.fromEntries(services.map((s) => [s.id, { unit: s2(room.prefs.svc[s.id]?.unit), off: !!room.prefs.svc[s.id]?.off }]))
  );
  const [newSvc, setNewSvc] = useState<{ name: string; type: string; price: string; scope: string }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true); setErr("");
    const res = await saveRoomProfile({ roomId: room.id, month, ...f, svc: Object.fromEntries(Object.entries(svc).map(([k, v]) => [k, v])), newSvc });
    setBusy(false);
    if (res.ok) onSaved(); else setErr(res.error);
  }
  const L = "mb-1 block text-xs font-medium text-gray-600";
  return (
    <div data-nav-scope className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Sửa phòng {room.code}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-900" aria-label="Đóng">✕</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={L}>Số phòng</label><input className={inp} value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={L}>Tên khách thuê</label><input className={inp} value={f.tenantName} onChange={(e) => set("tenantName", e.target.value)} /></div>
          <div><label className={L}>Số điện thoại</label><input className={inp} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><label className={L}>Số người ở</label><input className={inp} type="number" min="1" value={f.people} onChange={(e) => set("people", e.target.value)} /></div>
          <div><label className={L}>Giá thuê phòng (đ/tháng)</label><input className={inp} type="number" min="0" value={f.rent} onChange={(e) => set("rent", e.target.value)} /></div>
          <div><label className={L}>Ngày đóng tiền (hàng tháng)</label><input className={inp} type="number" min="1" max="31" value={f.dueDay} onChange={(e) => set("dueDay", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={L}>Ghi chú</label><input className={inp} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
        </div>

        <h3 className="mb-1 mt-5 text-sm font-semibold">Số điện, nước đầu vào</h3>
        <p className="mb-2 text-xs text-gray-500">Số đồng hồ lúc khách vào. Dùng làm &quot;số cũ&quot; của tháng đầu tiên khi phòng chưa có chỉ số nào.</p>
        <div className="mb-1 grid gap-3 sm:grid-cols-2">
          <div><label className={L}>Số điện đầu vào</label><input className={inp} type="number" min="0" step="0.1" value={f.elecStart} onChange={(e) => set("elecStart", e.target.value)} /></div>
          <div><label className={L}>Số nước đầu vào</label><input className={inp} type="number" min="0" step="0.1" value={f.waterStart} onChange={(e) => set("waterStart", e.target.value)} /></div>
        </div>

        <h3 className="mb-1 mt-5 text-sm font-semibold">Đơn giá riêng của phòng</h3>
        <p className="mb-2 text-xs text-gray-500">Để trống = dùng giá chung của nhà.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={L}>Giá điện (đ/kWh)</label><input className={inp} type="number" min="0" value={f.elecPrice} placeholder={String(room.input.elecPrice)} onChange={(e) => set("elecPrice", e.target.value)} /></div>
          <div><label className={L}>Giá nước ({room.input.waterMode === "person" ? "đ/người" : "đ/m³"})</label><input className={inp} type="number" min="0" value={f.waterPrice} placeholder={String(room.input.waterPrice)} onChange={(e) => set("waterPrice", e.target.value)} /></div>
        </div>

        <h3 className="mb-1 mt-5 text-sm font-semibold">Giá dịch vụ của phòng</h3>
        <p className="mb-2 text-xs text-gray-500">Wifi, máy giặt + sấy, vệ sinh/rác, gửi xe... Để trống giá = dùng giá chung của dịch vụ; tick &quot;Không thu&quot; nếu phòng này không dùng.</p>
        {(
          <>
            <div className="space-y-2">
              {services.filter((s) => !s.roomId || s.roomId === room.id).map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
                  <span className="text-sm">{s.name} <span className="text-xs text-gray-500">({s.type === "person" ? "theo người" : s.type === "vehicle" ? "theo xe" : "theo phòng"})</span></span>
                  <input className={`${inp} text-right`} type="number" min="0" value={svc[s.id].unit} placeholder={String(s.price)} disabled={svc[s.id].off} onChange={(e) => setSvc((p) => ({ ...p, [s.id]: { ...p[s.id], unit: e.target.value } }))} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={svc[s.id].off} onChange={(e) => setSvc((p) => ({ ...p, [s.id]: { ...p[s.id], off: e.target.checked } }))} />Không thu</label>
                </div>
              ))}
            </div>
          </>
        )}
        {services.filter((s) => !s.roomId || s.roomId === room.id).length === 0 && newSvc.length === 0 && <p className="mb-2 text-xs italic text-gray-400">Chưa có dịch vụ nào. Bấm một gợi ý bên dưới hoặc &quot;+ Thêm dịch vụ&quot;.</p>}
        <div className="mt-3 space-y-2">
          {newSvc.map((n, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-2 sm:grid-cols-[1fr_7rem_7rem_9rem_auto]">
              <input className={`${inp} col-span-2 sm:col-span-1`} list="room-svc-suggest" placeholder="Tên (VD: Wifi)" value={n.name} onChange={(e) => setNewSvc((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <select className={inp} value={n.type} onChange={(e) => setNewSvc((p) => p.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}><option value="room">Theo phòng</option><option value="person">Theo người</option><option value="vehicle">Theo xe</option></select>
              <input className={`${inp} text-right`} type="number" min="0" placeholder="Giá (đ)" value={n.price} onChange={(e) => setNewSvc((p) => p.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
              <select className={inp} value={n.scope} onChange={(e) => setNewSvc((p) => p.map((x, j) => (j === i ? { ...x, scope: e.target.value } : x)))}><option value="room">Chỉ phòng này</option><option value="house">Cả nhà</option></select>
              <button type="button" aria-label="Bỏ dòng" onClick={() => setNewSvc((p) => p.filter((_, j) => j !== i))} className="px-1 text-lg text-gray-400 hover:text-red-600">✕</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setNewSvc((p) => [...p, { name: "", type: "room", price: "", scope: "room" }])} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm dịch vụ</button>
            {["Wifi", "Máy giặt + sấy", "Vệ sinh, rác", "Gửi xe"].map((nm) => (
              <button key={nm} type="button" onClick={() => setNewSvc((p) => [...p, { name: nm, type: nm === "Gửi xe" ? "vehicle" : nm === "Vệ sinh, rác" ? "person" : "room", price: "", scope: "room" }])} className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50">+ {nm}</button>
            ))}
          </div>
          <datalist id="room-svc-suggest"><option value="Wifi" /><option value="Máy giặt + sấy" /><option value="Vệ sinh, rác" /><option value="Gửi xe" /><option value="Sạc xe điện" /><option value="Điều hòa" /><option value="Thang máy" /></datalist>
        </div>

        {err && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-xs text-gray-500">Lưu xong, hóa đơn tháng này của phòng được tính lại theo thông tin mới.</p>
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">Hủy</button>
          <button type="button" onClick={save} disabled={busy} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">{busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}
