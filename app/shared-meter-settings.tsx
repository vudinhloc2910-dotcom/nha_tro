"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSharedMeterConfig } from "./actions";

type Item = { id: string; name: string; start: string; parts: string };
const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

/** Cấu hình đồng hồ điện chung của nhà: tên, số đầu vào, phòng nào trả mấy phần. */
export function SharedMeterSettings({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Item>) => setItems((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true); setMsg(null);
    const res = await saveSharedMeterConfig(items);
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: "Đã lưu. Mỗi tháng nhập số đồng hồ chung ở trang Hóa đơn tháng." }); router.refresh(); }
    else setMsg({ ok: false, text: res.error });
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm italic text-gray-500">Chưa có đồng hồ chung nào.</p>}
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 sm:grid-cols-[1fr_8rem_2fr_auto]">
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Tên đồng hồ</label><input className={inp} value={it.name} placeholder="Điện nhà vệ sinh tầng 2" onChange={(e) => set(i, { name: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Số đầu vào</label><input className={inp} type="number" min="0" step="0.1" value={it.start} onChange={(e) => set(i, { start: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Phòng và số phần (VD 201:2, 202:1)</label><input className={inp} value={it.parts} placeholder="201:2, 202:1" onChange={(e) => set(i, { parts: e.target.value })} /></div>
          <div className="flex items-end"><button type="button" onClick={() => setItems((p) => p.filter((_, j) => j !== i))} className="rounded border border-red-200 px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50">Xóa</button></div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setItems((p) => [...p, { id: "", name: "", start: "0", parts: "" }])} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm đồng hồ chung</button>
        <button type="button" onClick={save} disabled={busy} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">{busy ? "Đang lưu…" : "Lưu đồng hồ chung"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
