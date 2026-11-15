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
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true); setErr("");
    const res = await saveRoomProfile({ roomId: room.id, month, ...f, svc: Object.fromEntries(Object.entries(svc).map(([k, v]) => [k, v])) });
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

        {services.filter((s) => !s.roomId || s.roomId === room.id).length > 0 && (
          <>
            <h3 className="mb-1 mt-5 text-sm font-semibold">Dịch vụ của phòng</h3>
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
