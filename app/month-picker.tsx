"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Chọn tháng bằng lưới 12 tháng (một chạm), có mũi tên chuyển năm và nút "Tháng này". */
export function MonthPicker({ action, month }: { action: string; month: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const nowIso = new Date().toISOString().slice(0, 7);
  const cur = Number(month.slice(5, 7));
  const go = (m: string) => { setOpen(false); router.push(`${action}?month=${m}`); };

  return (
    <div className="relative">
      <button type="button" onClick={() => { setYear(Number(month.slice(0, 4))); setOpen((v) => !v); }}
        className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
        Tháng {month.slice(5)}/{month.slice(0, 4)}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setYear((y) => y - 1)} className="rounded-lg px-3 py-1.5 text-lg text-gray-600 hover:bg-brand-50" aria-label="Năm trước">‹</button>
              <span className="font-semibold">Năm {year}</span>
              <button type="button" onClick={() => setYear((y) => y + 1)} className="rounded-lg px-3 py-1.5 text-lg text-gray-600 hover:bg-brand-50" aria-label="Năm sau">›</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const iso = `${year}-${String(m).padStart(2, "0")}`;
                const sel = year === Number(month.slice(0, 4)) && m === cur;
                return (
                  <button key={m} type="button" onClick={() => go(iso)}
                    className={`rounded-xl px-2 py-2.5 text-sm font-medium ${sel ? "bg-brand-600 text-white" : iso === nowIso ? "border border-brand-400 text-brand-800 hover:bg-brand-50" : "bg-gray-50 text-gray-800 hover:bg-brand-50"}`}>
                    Th {m}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => go(nowIso)} className="mt-3 w-full rounded-xl bg-brand-50 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100">Tháng này</button>
          </div>
        </>
      )}
    </div>
  );
}
