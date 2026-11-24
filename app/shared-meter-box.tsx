"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSharedReadings } from "./actions";
import { vnd } from "@/lib/format";
import type { SharedMeterView } from "@/lib/monthdata";

const inp = "w-28 rounded border border-gray-300 bg-white px-2 py-1 text-sm tabular-nums text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const s2 = (v: number | null) => (v === null ? "" : String(v));
const num = (s: string) => { const t = s.trim().replace(",", "."); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

/** Khung nhập số đồng hồ điện chung (nhà vệ sinh dùng chung...) của tháng; lưu xong web tự chia tiền cho các phòng. */
export function SharedMeterBox({ month, houseId, meters, elecPrice }: { month: string; houseId: number; meters: SharedMeterView[]; elecPrice: number }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, { old: string; new: string }>>(() => Object.fromEntries(meters.map((m) => [m.id, { old: String(m.old), new: s2(m.new) }])));
  const saved = useRef(JSON.stringify(vals));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (meters.length === 0) return null;

  async function commit() {
    const snap = JSON.stringify(vals);
    if (snap === saved.current || busy) return;
    setBusy(true); setMsg(null);
    const res = await saveSharedReadings(houseId, month, meters.map((m) => ({ id: m.id, old: vals[m.id].old, new: vals[m.id].new })));
    setBusy(false);
    if (res.ok) { saved.current = snap; setMsg({ ok: true, text: "Đã lưu ✓" }); router.refresh(); }
    else setMsg({ ok: false, text: res.error });
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-amber-900">Đồng hồ điện chung (nhà vệ sinh...)</h2>
        <span className="text-xs text-gray-600">Nhập số mới, web tự chia tiền cho các phòng và cộng vào tiền điện.</span>
        {busy && <span className="text-xs text-gray-500">Đang lưu…</span>}
        {msg && <span className={`text-xs ${msg.ok ? "text-green-700" : "font-medium text-red-700"}`}>{msg.text}</span>}
      </div>
      <div className="space-y-2">
        {meters.map((m) => {
          const v = vals[m.id];
          const o = num(v.old) ?? m.oldAuto, n = num(v.new);
          const kwh = n === null ? null : Math.max(0, n - o);
          const total = m.rooms.reduce((a, r) => a + r.parts, 0);
          const bad = n !== null && n < o;
          return (
            <div key={m.id} className="flex flex-wrap items-end gap-x-4 gap-y-1 rounded-lg bg-white/70 px-3 py-2">
              <div className="min-w-[12rem] text-sm font-medium text-gray-900">{m.name}</div>
              <label className="text-xs text-gray-600">Số cũ<input type="number" min="0" step="0.1" inputMode="decimal" className={`${inp} ml-1`} value={v.old} onChange={(e) => setVals((p) => ({ ...p, [m.id]: { ...p[m.id], old: e.target.value } }))} onBlur={() => void commit()} /></label>
              <label className="text-xs text-gray-600">Số mới<input type="number" min="0" step="0.1" inputMode="decimal" placeholder="Nhập số mới" className={`${inp} ml-1 ${bad ? "border-red-500 bg-red-50" : ""}`} value={v.new} onChange={(e) => setVals((p) => ({ ...p, [m.id]: { ...p[m.id], new: e.target.value } }))} onBlur={() => void commit()} /></label>
              <div className="text-xs text-gray-700">
                {bad ? <span className="font-medium text-red-700">⚠ Số mới nhỏ hơn số cũ</span>
                  : kwh === null ? <span className="text-gray-400">chưa nhập số mới</span>
                  : <>Dùng <b>{Math.round(kwh * 10) / 10} kWh</b> × {vnd(elecPrice)} = <b>{vnd(Math.round(kwh * elecPrice))}</b></>}
              </div>
              <div className="flex w-full flex-wrap gap-x-4 text-xs text-amber-900">
                {m.rooms.map((r) => (
                  <span key={r.roomId}>Phòng {r.code} ({r.parts}/{total} phần){kwh !== null && !bad ? <>: <b>{vnd(Math.round((kwh * elecPrice * r.parts) / total))}</b></> : null}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
