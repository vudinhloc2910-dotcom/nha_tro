"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { type: string; id: number; title: string; sub: string; href: string; house: string };
type Group = { type: string; hits: Hit[]; total: number };
const LABEL: Record<string, string> = { room: "Phòng", tenant: "Khách thuê", resident: "Người ở (CCCD)", vehicle: "Xe", invoice: "Hóa đơn", issue: "Sự cố", ledger: "Sổ thu chi" };

/** Ô tìm nhanh trên thanh trên: gõ là ra kết quả theo nhóm (phòng, khách, CCCD, biển số, hóa đơn, sự cố, thu chi) của tất cả các nhà. Phím "/" để nhảy vào ô. */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (r.ok && id === seq.current) setGroups(((await r.json()) as { groups: Group[] }).groups);
      } catch { /* mất mạng: giữ kết quả cũ */ }
      if (id === seq.current) setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      const t = e.target as HTMLElement;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA" && t.tagName !== "SELECT" && !t.isContentEditable) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown); document.addEventListener("touchstart", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); document.removeEventListener("keydown", onKey); };
  }, []);

  const shown = q.trim() ? groups : [];
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <div ref={box} className="relative hidden w-56 md:block lg:w-64">
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`); }}>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Tìm tên, phòng, SĐT, biển số…  ( / )" aria-label="Tìm kiếm"
          className="w-full rounded-full border border-gray-300 bg-gray-50 py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </form>
      {open && q.trim() && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[26rem] max-w-[90vw] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl">
          {shown.length === 0 ? <p className="px-3 py-3 text-sm text-gray-500">{loading ? "Đang tìm…" : "Không thấy kết quả nào."}</p> : shown.map((g) => (
            <div key={g.type} className="py-1">
              <div className="px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{LABEL[g.type] ?? g.type} ({g.total})</div>
              {g.hits.map((h) => (
                <button key={`${g.type}-${h.id}`} type="button" onClick={() => go(h.href)} className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-brand-50">
                  <div className="truncate text-sm font-medium text-gray-900">{h.title}</div>
                  <div className="truncate text-xs text-gray-500">{h.sub}{h.house ? ` · ${h.house}` : ""}</div>
                </button>
              ))}
            </div>
          ))}
          <button type="button" onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} className="mt-1 block w-full rounded-lg border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50">Xem tất cả kết quả và lọc nâng cao →</button>
        </div>
      )}
    </div>
  );
}
