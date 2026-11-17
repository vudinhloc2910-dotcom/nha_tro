"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { saveRoomMonth, saveRoomNote, saveRoomProfile, type RoomMonthInput, type SaveResult } from "./actions";
import { StatusBadge } from "./components";
import { CopyButton } from "./copy-button";
import { DateVN } from "./date-input";
import { MoneyField, fmtMoney } from "./money-field";
import { RoomEditor } from "./room-editor";
import { MonthExtras, type LiveThu, type RoomCost } from "./month-extras";
import type { LedgerMonth } from "@/lib/ledgermonth";
import { computeInvoice, svcAuto, svcUnitLabel, type RoomInput } from "@/lib/calc";
import { statusOf, vnd } from "@/lib/format";
import type { RoomView } from "@/lib/monthdata";

type Svc = { id: number; name: string; type: "room" | "person" | "vehicle"; price: number; roomId: number | null };
type Form = {
  periodStart: string; periodEnd: string; people: string; rent: string;
  elecOld: string; elecNew: string; waterOld: string; waterNew: string;
  svc: Record<number, string>; extras: { name: string; amount: string }[]; discount: string; debt: string;
};
type Inv = { id: number; token: string; total: number; paid: number; due: string; locked: boolean; state?: string; lines?: { label: string; detail: string; amount: number }[] } | null;
type St = { state: "idle" | "saving" | "saved" | "error"; msg: string };

const s2 = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function initForm(r: RoomView): Form {
  const i = r.input;
  return {
    periodStart: i.periodStart, periodEnd: i.periodEnd, people: String(i.people), rent: String(i.rent),
    elecOld: String(i.elecOld), elecNew: s2(i.elecNew), waterOld: String(i.waterOld), waterNew: s2(i.waterNew),
    svc: Object.fromEntries(i.services.map((s) => [s.id, s2(s.amount)])),
    extras: i.extras.map((e) => ({ name: e.name, amount: String(e.amount) })),
    discount: i.discount ? String(i.discount) : "", debt: i.debt ? String(i.debt) : "",
  };
}

function buildInput(r: RoomView, f: Form, waterMode: "meter" | "person"): RoomInput {
  return {
    people: Math.max(1, Math.round(num(f.people) ?? 1)), vehicles: r.input.vehicles, rent: num(f.rent) ?? 0,
    elecOld: num(f.elecOld) ?? 0, elecNew: num(f.elecNew), elecPrice: r.input.elecPrice,
    waterMode, waterOld: num(f.waterOld) ?? 0, waterNew: num(f.waterNew), waterPrice: r.input.waterPrice,
    services: r.input.services.map((s) => ({ ...s, amount: num(f.svc[s.id] ?? "") })),
    extras: f.extras.map((e) => ({ name: e.name.trim(), amount: num(e.amount) ?? 0 })).filter((e) => e.name && e.amount),
    discount: Math.abs(num(f.discount) ?? 0), debt: num(f.debt) ?? 0,
    periodStart: f.periodStart, periodEnd: f.periodEnd,
  };
}

const cell = "border-b border-gray-100 px-1 py-0.5 align-top";
const labelCell = "sticky left-0 z-10 w-28 min-w-[7rem] border-b border-gray-100 px-1.5 py-1 text-[11px] font-semibold uppercase leading-tight";
const inpT = "w-full rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[13px] text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

export function MonthGrid({ month, houseId, houseName, waterMode, services, rooms, vacant, ledger }: {
  month: string; houseId: number; houseName: string; waterMode: "meter" | "person"; services: Svc[]; rooms: RoomView[]; vacant: string[]; ledger: LedgerMonth;
}) {
  const router = useRouter();
  const [forms, setForms] = useState<Record<number, Form>>(() => Object.fromEntries(rooms.map((r) => [r.id, initForm(r)])));
  const saved = useRef<Record<number, string>>(Object.fromEntries(rooms.map((r) => [r.id, JSON.stringify(initForm(r))])));
  const busy = useRef<Record<number, boolean>>({});
  const latest = useRef(forms);
  latest.current = forms;
  const [invs, setInvs] = useState<Record<number, Inv>>(() => Object.fromEntries(rooms.map((r) => [r.id, r.invoice])));
  const [status, setStatus] = useState<Record<number, St>>({});
  const [editing, setEditing] = useState<RoomView | null>(null);
  // Ghi chú riêng của từng phòng trong tháng (lưu riêng, không làm tính lại hóa đơn)
  const [notes, setNotes] = useState<Record<number, string>>(() => Object.fromEntries(rooms.map((r) => [r.id, r.monthNote])));
  const notesSaved = useRef<Record<number, string>>(Object.fromEntries(rooms.map((r) => [r.id, r.monthNote])));
  const [noteErr, setNoteErr] = useState<Record<number, string>>({});
  async function commitNote(id: number) {
    const v = (notes[id] ?? "").trim();
    if (v === notesSaved.current[id]) return;
    let ok = false;
    try { ok = (await saveRoomNote(id, month, v)).ok; } catch { ok = false; }
    if (ok) { notesSaved.current[id] = v; setNoteErr((p) => ({ ...p, [id]: "" })); }
    else setNoteErr((p) => ({ ...p, [id]: "Chưa lưu được ghi chú" }));
  }
  const noteBox = (id: number, cls: string) => {
    const has = (notes[id] ?? "").trim() !== "";
    return (
      <>
        <textarea rows={2} data-room={id} value={notes[id] ?? ""} placeholder="Ghi chú (nếu có)" maxLength={300}
          onChange={(e) => setNotes((p) => ({ ...p, [id]: e.target.value }))} onBlur={() => void commitNote(id)}
          className={`${cls} resize-y rounded border px-1.5 py-1 text-[12px] leading-snug focus:outline-none focus:ring-1 focus:ring-brand-600 ${has ? "border-amber-300 bg-amber-50 font-semibold text-amber-900" : "border-gray-200 bg-white font-normal text-gray-400 placeholder:text-gray-300"}`} />
        {noteErr[id] && <div className="text-[11px] text-red-700">{noteErr[id]}</div>}
      </>
    );
  };
  const mm = month.slice(5);
  const [tab, setTab] = useState<"elec" | "water">("elec");

  const setF = (id: number, patch: Partial<Form>) => setForms((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const setSt = (id: number, s: St) => setStatus((p) => ({ ...p, [id]: s }));

  /** Tự lưu một phòng khi chủ trọ sửa xong ô (rời ô) nếu có thay đổi. */
  async function commit(id: number) {
    if (busy.current[id]) return;
    const f = latest.current[id];
    const snap = JSON.stringify(f);
    if (snap === saved.current[id]) return;
    busy.current[id] = true;
    setSt(id, { state: "saving", msg: "Đang lưu…" });
    const payload: RoomMonthInput = {
      roomId: id, houseId, month, people: f.people, rent: f.rent, periodStart: f.periodStart, periodEnd: f.periodEnd,
      elecOld: f.elecOld, elecNew: f.elecNew, waterOld: f.waterOld, waterNew: f.waterNew,
      svc: Object.fromEntries(Object.entries(f.svc).map(([k, v]) => [k, v])), extras: f.extras, discount: f.discount, debt: f.debt,
    };
    let res: SaveResult;
    try { res = await saveRoomMonth(payload); } catch { res = { ok: false, error: "Mất kết nối, chưa lưu được" }; }
    busy.current[id] = false;
    if (res.ok) {
      saved.current[id] = snap;
      if (res.invoice) setInvs((p) => ({ ...p, [id]: res.invoice }));
      setSt(id, { state: "saved", msg: res.invoice ? "Đã lưu ✓" : "Đã lưu (chưa có hóa đơn)" });
      if (JSON.stringify(latest.current[id]) !== snap) void commit(id); // trong lúc lưu lại có sửa tiếp
    } else {
      setSt(id, { state: "error", msg: res.error });
    }
  }

  /** Enter / mũi tên lên xuống: nhảy sang ô kế tiếp trong cùng cột phòng. */
  function onKey(e: React.KeyboardEvent<HTMLElement>, id: number) {
    const t = e.target as HTMLElement;
    // Enter: xuống ô dưới của phòng này. Phím mũi tên do ArrowNav (toàn web) lo.
    if (t.tagName !== "INPUT" || e.key !== "Enter") return;
    const list = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-room="${id}"]:not([disabled])`)).filter((i) => i.offsetParent !== null && !i.closest("details:not([open])"));
    const at = list.indexOf(t as HTMLInputElement);
    const next = list[at + 1];
    if (next) { e.preventDefault(); next.focus(); next.select?.(); return; }
    // Hết ô của phòng này (thẻ điện thoại): lưu phòng này rồi nhảy sang ô "số mới" của phòng kế tiếp
    if (e.key === "Enter") {
      e.preventDefault();
      (t as HTMLInputElement).blur();
      const idx = rooms.findIndex((r) => r.id === id);
      for (const r of rooms.slice(idx + 1)) {
        const nx = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-room="${r.id}"][placeholder="Nhập số mới"]`)).find((i) => i.offsetParent !== null && !i.closest("details:not([open])"));
        if (nx) { nx.focus(); nx.scrollIntoView({ block: "center" }); break; }
      }
    }
  }

  // Tính tiền và so sánh "đã sửa chưa" MỘT LẦN cho mỗi phòng sau mỗi lần gõ (trước đây tính lại hàng trăm lần mỗi lần gõ)
  const calcMap = useMemo(
    () => Object.fromEntries(rooms.map((r) => [r.id, computeInvoice(buildInput(r, forms[r.id], waterMode))])),
    [rooms, forms, waterMode]
  );
  const dirtyMap: Record<number, boolean> = {};
  for (const r of rooms) dirtyMap[r.id] = JSON.stringify(forms[r.id]) !== saved.current[r.id];
  const calc = (r: RoomView) => calcMap[r.id];
  const dirty = (r: RoomView) => dirtyMap[r.id];

  const totals = rooms.reduce((a, r) => {
    const inv = invs[r.id];
    const total = inv && !dirty(r) ? inv.total : calc(r).total;
    return { total: a.total + total, paid: a.paid + Math.min(inv?.paid ?? 0, total) };
  }, { total: 0, paid: 0 });

  // ===== Cột TỔNG (cộng tất cả phòng) và tổng thu theo khoản (dùng cho bảng lợi nhuận) =====
  const sumBy = (f: (r: RoomView) => number) => rooms.reduce((a, r) => a + f(r), 0);
  const lineSum = (r: RoomView, label: string) => calc(r).lines.filter((l) => l.label === label).reduce((a, l) => a + l.amount, 0);
  const paidOf = (r: RoomView) => Math.min(invs[r.id]?.paid ?? 0, (invs[r.id] && !dirty(r) ? invs[r.id]!.total : calc(r).total));
  const totalOf = (r: RoomView) => (invs[r.id] && !dirty(r) ? invs[r.id]!.total : calc(r).total);
  const thu: LiveThu = { dien: 0, nuoc: 0, mang: 0, dich_vu: 0, tien_phong: 0, phat_sinh: 0 };
  for (const r of rooms) {
    const stored = invs[r.id];
    // Hóa đơn đã lưu và chưa sửa: dùng đúng các dòng đã lưu (khớp sheet); đang sửa: dùng số tính trực tiếp
    const useLines = stored?.lines && stored.lines.length && !dirty(r) ? stored.lines : calc(r).lines;
    for (const l of useLines) {
      if (l.label === "Nợ kỳ trước") continue;
      if (l.label === "Tiền điện") thu.dien += l.amount;
      else if (l.label === "Tiền nước") thu.nuoc += l.amount;
      else if (l.label === "Tiền thuê phòng" || l.label === "Tiền phòng" || l.label.startsWith("Giảm")) thu.tien_phong += l.amount;
      else if (l.detail === "Phụ phí phát sinh") thu.phat_sinh += l.amount;
      else if (/wifi|mạng|internet/i.test(l.label)) thu.mang += l.amount;
      else thu.dich_vu += l.amount;
    }
  }
  // Chi phí từng phòng (điện + nước + dịch vụ) để chọn phòng chủ nhà ở trong bảng thanh toán với chủ nhà
  const roomCosts: RoomCost[] = rooms.map((r) => {
    const stored = invs[r.id];
    const ls = stored?.lines && stored.lines.length && !dirty(r) ? stored.lines : calc(r).lines;
    let elec = 0, water = 0, svc = 0;
    for (const l of ls) {
      if (l.label === "Tiền điện") elec += l.amount;
      else if (l.label === "Tiền nước") water += l.amount;
      else if (l.label === "Nợ kỳ trước" || l.label === "Tiền thuê phòng" || l.label === "Tiền phòng" || l.label.startsWith("Giảm") || l.detail === "Phụ phí phát sinh") continue;
      else svc += l.amount;
    }
    return { id: r.id, code: r.code, tenant: r.tenantName, elec, water, svc };
  });
  const T = (v: number) => vnd(v);
  const tN = (v: number) => (Math.round(v * 10) / 10).toLocaleString("vi-VN");

  const filled = rooms.filter((r) => num(forms[r.id][tab === "water" && waterMode === "meter" ? "waterNew" : "elecNew"]) !== null).length;

  if (rooms.length === 0) return <p className="text-sm text-gray-600">Nhà này chưa có phòng nào có khách thuê. Thêm phòng và khách ở mục Phòng, hoặc nhập dữ liệu cũ ở Khác → Nhập dữ liệu sheet.</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[["Phải thu", vnd(totals.total), ""], ["Đã thu", vnd(totals.paid), "text-green-700"], ["Còn nợ", vnd(totals.total - totals.paid), totals.total - totals.paid > 0 ? "text-red-700" : ""]].map(([l, v, c], i) => (
          <div key={l} className={`rounded-2xl border border-stone-200 bg-white p-3 shadow-sm ${["border-t-4 border-t-sky-400", "border-t-4 border-t-teal-400", "border-t-4 border-t-rose-400"][i]}`}><div className="text-xs text-gray-500">{l}</div><div className={`mt-1 whitespace-nowrap text-[15px] font-bold sm:text-lg ${c}`}>{v}</div></div>
        ))}
      </div>
      <p className="text-xs text-gray-600">
        <span className="hidden md:inline">Gõ vào ô rồi bấm <b>Enter</b> (xuống ô dưới) hoặc <b>Tab</b> (sang ô kế). <b>Tự lưu</b> khi rời ô, tiền tự tính ngay. Ô chữ mờ là số tự động, gõ số khác để đặt riêng cho phòng đó.</span>
        <span className="md:hidden"><b>Tự lưu</b> khi rời ô. Chọn Điện/Nước rồi gõ số mới của từng phòng, tiền tự tính ngay.</span>
      </p>


      {/* ===== Điện thoại: thẻ từng phòng (máy tính dùng bảng bên dưới) ===== */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex gap-2">
            {([["elec", "Điện"], ...(waterMode === "meter" ? [["water", "Nước"]] : [])] as [string, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k as "elec" | "water")}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${tab === k ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-800"}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Đã ghi {tab === "water" ? "nước" : "điện"} {filled}/{rooms.length} phòng</span>
            <span className="text-gray-500">{Math.round((filled / rooms.length) * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${(filled / rooms.length) * 100}%` }} /></div>
        </div>

        {rooms.map((r) => {
          const f = forms[r.id];
          const inv = invs[r.id];
          const st = inv ? statusOf(inv.total, inv.paid, inv.due, inv.state ?? "") : null;
          const c = calc(r);
          const total = inv && !dirty(r) ? inv.total : c.total;
          const remain = Math.max(0, total - (inv?.paid ?? 0));
          const isW = tab === "water" && waterMode === "meter";
          const oldK = isW ? "waterOld" : "elecOld", newK = isW ? "waterNew" : "elecNew";
          const o = num(f[oldK]) ?? 0, n = num(f[newK]);
          const used = n === null ? null : n - o;
          const prevU = isW ? r.prevUsage?.w : r.prevUsage?.e;
          const warn = used !== null && used < 0 ? "Nhỏ hơn số cũ" : used !== null && prevU && prevU > 20 && used > prevU * 3 ? `Tăng bất thường (tháng trước ${Math.round(prevU)})` : "";
          const path = inv ? `/pay/${inv.token}` : "";
          const msg = `Chào anh/chị phòng ${r.code}, hóa đơn tiền trọ tháng ${mm} là ${vnd(remain || (inv?.total ?? 0))}. Xem chi tiết và quét QR chuyển khoản: {link}`;
          const stt = status[r.id];
          const setExtras = (extras: Form["extras"], save = false) => { latest.current = { ...latest.current, [r.id]: { ...latest.current[r.id], extras } }; setF(r.id, { extras }); if (save) setTimeout(() => commit(r.id), 0); };
          return (
            <div key={r.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${st === "overdue" ? "border-red-300" : "border-stone-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-lg font-bold">Phòng {r.code}</span>{st && <StatusBadge status={st} />}</div>
                  <div className="truncate text-sm text-gray-600">{r.tenantName}{r.phone ? ` · ${r.phone}` : ""} · {f.people} người</div>
                </div>
                <button type="button" onClick={() => setEditing(r)} className="shrink-0 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800">Sửa</button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-600">{isW ? "Nước cũ" : "Điện cũ"}
                  <input type="number" step="0.1" min="0" inputMode="decimal" data-room={r.id} value={f[oldK]} onChange={(e) => setF(r.id, { [oldK]: e.target.value } as Partial<Form>)} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} mt-1 py-2.5 bg-gray-50`} />
                </label>
                <label className="block text-xs text-gray-600">{isW ? "Nước mới" : "Điện mới"}
                  <input type="number" step="0.1" min="0" inputMode="decimal" data-room={r.id} value={f[newK]} placeholder="Nhập số mới" onChange={(e) => setF(r.id, { [newK]: e.target.value } as Partial<Form>)} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)}
                    className={`${inp} mt-1 py-2.5 ${used !== null && used < 0 ? "border-red-500 bg-red-50" : warn ? "border-amber-500 bg-amber-50" : ""}`} />
                </label>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between text-sm">
                <span className="text-gray-600">{used !== null && used >= 0 ? `Dùng ${Math.round(used * 10) / 10} ${isW ? "m³" : "kWh"} = ` : ""}{used !== null && used >= 0 ? <b>{vnd(isW ? c.water : c.elec)}</b> : <span className="text-gray-400">chưa nhập số mới</span>}</span>
                {warn && <span className={`text-xs ${used! < 0 ? "text-red-700" : "text-amber-700"}`}>⚠ {warn}</span>}
              </div>

              <div className="mt-3 flex items-end justify-between rounded-xl bg-brand-50 px-3 py-2.5">
                <div><div className="text-xs text-gray-600">Tổng cần nộp</div><div className="text-xl font-extrabold">{vnd(total)}</div></div>
                <div className="text-right"><div className="text-xs text-gray-600">Còn nợ</div><div className={`text-base font-bold ${remain > 0 ? "text-red-700" : "text-green-700"}`}>{vnd(remain)}</div></div>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer py-1.5 text-sm font-medium text-brand-700">Chi tiết các khoản khác (tiền phòng, dịch vụ, phụ phí…)</summary>
                <div className="mt-2 space-y-3 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs text-gray-600">Kỳ từ<DateVN data-room={r.id} value={f.periodStart} onChange={(v) => setF(r.id, { periodStart: v })} onBlur={() => commit(r.id)} className={`${inp} mt-1`} /></label>
                    <label className="block text-xs text-gray-600">Kỳ đến<DateVN data-room={r.id} value={f.periodEnd} onChange={(v) => setF(r.id, { periodEnd: v })} onBlur={() => commit(r.id)} className={`${inp} mt-1`} /></label>
                    <label className="block text-xs text-gray-600">Số người<input type="number" min="1" inputMode="numeric" data-room={r.id} value={f.people} onChange={(e) => setF(r.id, { people: e.target.value })} onBlur={() => commit(r.id)} className={`${inp} mt-1`} /></label>
                    <label className="block text-xs text-gray-600">Tiền phòng<MoneyField data-room={r.id} value={f.rent} onChange={(v) => setF(r.id, { rent: v })} onBlur={() => commit(r.id)} className={`${inp} mt-1`} /></label>
                  </div>
                  {services.map((s) => {
                    const sv = r.input.services.find((x) => x.id === s.id)!;
                    const auto = svcAuto(sv, Math.max(1, Math.round(num(f.people) ?? 1)), r.input.vehicles);
                    if (sv.off) return null;
                    return (
                      <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
                        <span>{s.name}<span className="block text-[11px] text-gray-400">{sv.type === "room" ? "theo phòng" : `${vnd(sv.unit)}${svcUnitLabel(sv)}`}</span></span>
                        <div className="w-36"><MoneyField data-room={r.id} value={f.svc[s.id] ?? ""} placeholder={fmtMoney(auto)} onChange={(v) => setF(r.id, { svc: { ...f.svc, [s.id]: v } })} onBlur={() => commit(r.id)} className={inp} /></div>
                      </label>
                    );
                  })}
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Phụ phí phát sinh</div>
                    <div className="space-y-2">
                      {f.extras.map((e, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input data-room={r.id} value={e.name} placeholder="Tên khoản" onChange={(ev) => setExtras(f.extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} onBlur={() => commit(r.id)} className={`${inp} min-w-0 flex-1`} />
                          <div className="w-36"><MoneyField allowNegative data-room={r.id} value={e.amount} placeholder="Tiền" onChange={(v) => setExtras(f.extras.map((x, j) => (j === i ? { ...x, amount: v } : x)))} onBlur={() => commit(r.id)} className={inp} /></div>
                          <button type="button" aria-label="Xóa khoản" onClick={() => setExtras(f.extras.filter((_, j) => j !== i), true)} className="px-1 text-lg text-gray-400">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setExtras([...f.extras, { name: "", amount: "" }])} className="text-sm font-medium text-brand-700">+ Thêm khoản</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs text-gray-600">Giảm giá<MoneyField data-room={r.id} value={f.discount} placeholder="0" onChange={(v) => setF(r.id, { discount: v })} onBlur={() => commit(r.id)} className={`${inp} mt-1`} /></label>
                    <label className="block text-xs text-gray-600">Nợ cũ{r.auto.debt > 0 ? ` (kỳ trước ${vnd(r.auto.debt)})` : ""}<MoneyField data-room={r.id} value={f.debt} placeholder="0" onChange={(v) => setF(r.id, { debt: v })} onBlur={() => commit(r.id)} className={`${inp} mt-1`} /></label>
                  </div>
                </div>
              </details>

              <div className="mt-2">{noteBox(r.id, "w-full")}</div>
              <div className={`mt-2 text-xs ${stt?.state === "error" ? "font-medium text-red-700" : stt?.state === "saving" ? "text-gray-500" : "text-green-700"}`}>{stt?.msg ?? (inv ? "" : "Chưa có hóa đơn: nhập số điện mới")}</div>
              {inv && !dirty(r) && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <CopyButton path={path} message={msg} label={r.phone ? "Chép tin & mở Zalo" : "Chép tin nhắn"} primary zaloPhone={r.phone} />
                  <CopyButton path={path} label="Chép link" />
                  <Link href={path} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800">Xem hóa đơn</Link>
                  <Link href={`/invoices/${inv.id}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800">Thu tiền</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div data-nav-scope className="hidden max-h-[calc(100vh-8rem)] overflow-auto rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-28 min-w-[7rem] border-b border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] font-semibold uppercase leading-tight text-gray-600">{houseName}</th>
              {rooms.map((r) => {
                const inv = invs[r.id];
                const st = inv ? statusOf(inv.total, inv.paid, inv.due, inv.state ?? "") : null;
                return (
                  <th key={r.id} className="sticky top-0 z-20 min-w-[8.75rem] border-b border-gray-200 bg-gray-50 px-1.5 py-1 text-left align-top shadow-[0_1px_0_0_#e5e7eb]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">Phòng {r.code}</span>
                      <button type="button" onClick={() => setEditing(r)} className="rounded border border-brand-300 bg-white px-1.5 text-[11px] font-medium leading-5 text-brand-800 hover:bg-brand-50">Sửa</button>
                    </div>
                    <div className="truncate text-[11px] font-normal leading-tight text-gray-600" title={r.tenantName}>{r.tenantName}{r.phone ? ` · ${r.phone}` : ""}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {st && <StatusBadge status={st} />}
                      {inv?.locked && !dirty(r) ? <span className="text-[11px] font-normal text-brand-700">(từ sheet)</span> : null}
                    </div>
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 min-w-[6.5rem] border-b border-l border-gray-200 bg-brand-100 px-1.5 py-1 text-center align-middle text-sm font-extrabold text-brand-900 shadow-[0_1px_0_0_#e5e7eb]">TỔNG</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Kỳ hạn thuê">
              {rooms.map((r) => (
                <td key={r.id} className={cell}>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">Từ<DateVN data-room={r.id} value={forms[r.id].periodStart} onChange={(v) => setF(r.id, { periodStart: v })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inpT} text-[11px]`} /></label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500">Đến<DateVN data-room={r.id} value={forms[r.id].periodEnd} onChange={(v) => setF(r.id, { periodEnd: v })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inpT} text-[11px]`} /></label>
                  </div>
                </td>
              ))}
            </Row>
            <Row label="Số người" tot={tN(sumBy((r) => num(forms[r.id].people) ?? 0))}>
              {rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="people" setF={setF} commit={commit} onKey={onKey} />)}
            </Row>
            <Row label="Điện cũ" tone="elec" tot={tN(sumBy((r) => num(forms[r.id].elecOld) ?? 0))}>{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="elecOld" setF={setF} commit={commit} onKey={onKey} step="0.1" />)}</Row>
            <Row label="Điện mới" tone="elec" tot={tN(sumBy((r) => num(forms[r.id].elecNew) ?? 0))}>
              {rooms.map((r) => {
                const f = forms[r.id];
                const o = num(f.elecOld) ?? 0, n = num(f.elecNew);
                const used = n === null ? null : n - o;
                const warn = used !== null && used < 0 ? "Nhỏ hơn số cũ" : used !== null && r.prevUsage && r.prevUsage.e > 20 && used > r.prevUsage.e * 3 ? `Tăng bất thường (tháng trước ${Math.round(r.prevUsage.e)} kWh)` : "";
                return (
                  <td key={r.id} className={cell}>
                    <input type="number" step="0.1" min="0" inputMode="decimal" data-room={r.id} value={f.elecNew} placeholder="Nhập số mới" onChange={(e) => setF(r.id, { elecNew: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inpT} ${used !== null && used < 0 ? "border-red-500 bg-red-50" : warn ? "border-amber-500 bg-amber-50" : ""}`} />
                    {warn && <div className={`mt-0.5 text-[11px] ${used! < 0 ? "text-red-700" : "text-amber-700"}`}>⚠ {warn}</div>}
                  </td>
                );
              })}
            </Row>
            <Row label="Tiền điện" calc tone="elec" tot={T(thu.dien)}>{rooms.map((r) => {
              const f = forms[r.id]; const c = calc(r);
              const has = num(f.elecNew) !== null;
              const used = has ? Math.max(0, (num(f.elecNew) ?? 0) - (num(f.elecOld) ?? 0)) : 0;
              return (
                <td key={r.id} className={`${cell} text-right`}>
                  {has ? <div className="text-[15px] font-bold leading-tight text-amber-900">{vnd(c.elec)}</div> : <div className="text-sm text-amber-700/50">—</div>}
                  <div className="text-[10.5px] leading-tight text-amber-800/70">{has ? `${Math.round(used * 10) / 10} kWh × ${fmtMoney(r.input.elecPrice)}` : "chưa nhập số mới"}</div>
                </td>
              );
            })}</Row>
            {waterMode === "meter" ? (
              <>
                <Row label="Nước cũ" tone="water" tot={tN(sumBy((r) => num(forms[r.id].waterOld) ?? 0))}>{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="waterOld" setF={setF} commit={commit} onKey={onKey} step="0.1" />)}</Row>
                <Row label="Nước mới" tone="water" tot={tN(sumBy((r) => num(forms[r.id].waterNew) ?? 0))}>
                  {rooms.map((r) => {
                    const f = forms[r.id];
                    const o = num(f.waterOld) ?? 0, n = num(f.waterNew);
                    const used = n === null ? null : n - o;
                    return (
                      <td key={r.id} className={cell}>
                        <input type="number" step="0.1" min="0" inputMode="decimal" data-room={r.id} value={f.waterNew} placeholder="Nhập số mới" onChange={(e) => setF(r.id, { waterNew: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inpT} ${used !== null && used < 0 ? "border-red-500 bg-red-50" : ""}`} />
                        {used !== null && used < 0 && <div className="mt-0.5 text-[11px] text-red-700">⚠ Nhỏ hơn số cũ</div>}
                      </td>
                    );
                  })}
                </Row>
              </>
            ) : null}
            <Row label="Tiền nước" calc tone="water" tot={T(thu.nuoc)}>{rooms.map((r) => {
              const f = forms[r.id]; const c = calc(r);
              const meter = waterMode === "meter";
              const has = !meter || num(f.waterNew) !== null;
              const used = meter ? Math.max(0, (num(f.waterNew) ?? 0) - (num(f.waterOld) ?? 0)) : Math.max(1, Math.round(num(f.people) ?? 1));
              return (
                <td key={r.id} className={`${cell} text-right`}>
                  {has ? <div className="text-[15px] font-bold leading-tight text-sky-900">{vnd(c.water)}</div> : <div className="text-sm text-sky-700/50">—</div>}
                  <div className="text-[10.5px] leading-tight text-sky-800/70">{has ? `${Math.round(used * 10) / 10} ${meter ? "m³" : "người"} × ${fmtMoney(r.input.waterPrice)}` : "chưa nhập số mới"}</div>
                </td>
              );
            })}</Row>
            {services.map((s) => (
              <Row key={s.id} tone="svc" label={s.roomId ? `${s.name} (P.${rooms.find((x) => x.id === s.roomId)?.code ?? ""})` : s.name} tot={T(sumBy((r) => lineSum(r, s.name)))}>
                {rooms.map((r) => {
                  const sv = r.input.services.find((x) => x.id === s.id)!;
                  const f = forms[r.id];
                  const auto = svcAuto(sv, Math.max(1, Math.round(num(f.people) ?? 1)), r.input.vehicles);
                  if (sv.off) return <td key={r.id} className={`${cell} text-center text-xs text-gray-400`}>Không thu</td>;
                  return (
                    <td key={r.id} className={cell}>
                      <MoneyField data-room={r.id} value={f.svc[s.id] ?? ""} placeholder={fmtMoney(auto)} onChange={(v) => setF(r.id, { svc: { ...f.svc, [s.id]: v } })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inpT} italic placeholder:italic placeholder:text-gray-400`} />
                      <div className="mt-0.5 text-right text-[10px] leading-tight text-gray-400">{sv.type === "room" ? "theo phòng" : `${vnd(sv.unit)}${svcUnitLabel(sv)}`}</div>
                    </td>
                  );
                })}
              </Row>
            ))}
            <Row label="Tiền phòng" tone="rent" tot={T(sumBy((r) => num(forms[r.id].rent) ?? 0))}>{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="rent" setF={setF} commit={commit} onKey={onKey} right />)}</Row>
            <Row label="Phụ phí phát sinh" tot={T(thu.phat_sinh)}>
              {rooms.map((r) => {
                const f = forms[r.id];
                const setExtras = (extras: Form["extras"], save = false) => { latest.current = { ...latest.current, [r.id]: { ...latest.current[r.id], extras } }; setF(r.id, { extras }); if (save) setTimeout(() => commit(r.id), 0); };
                return (
                  <td key={r.id} className={cell}>
                    <div className="space-y-1">
                      {f.extras.map((e, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <input data-room={r.id} value={e.name} placeholder="Tên khoản" onChange={(ev) => setExtras(f.extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} onBlur={() => commit(r.id)} onKeyDown={(ev) => onKey(ev, r.id)} className={`${inpT} min-w-0 flex-1`} />
                          <div className="w-28 shrink-0"><MoneyField allowNegative data-room={r.id} value={e.amount} placeholder="Tiền" onChange={(v) => setExtras(f.extras.map((x, j) => (j === i ? { ...x, amount: v } : x)))} onBlur={() => commit(r.id)} onKeyDown={(ev) => onKey(ev, r.id)} className={inpT} /></div>
                          <button type="button" aria-label="Xóa khoản" onClick={() => setExtras(f.extras.filter((_, j) => j !== i), true)} className="px-1 text-gray-400 hover:text-red-600">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setExtras([...f.extras, { name: "", amount: "" }])} className="text-xs font-medium text-brand-700 hover:underline">+ Thêm khoản</button>
                    </div>
                  </td>
                );
              })}
            </Row>
            <Row label="Giảm giá" tot={T(sumBy((r) => Math.abs(num(forms[r.id].discount) ?? 0)))}>{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="discount" setF={setF} commit={commit} onKey={onKey} right placeholder="0" />)}</Row>
            <Row label="Nợ cũ" tot={T(sumBy((r) => num(forms[r.id].debt) ?? 0))}>
              {rooms.map((r) => (
                <td key={r.id} className={cell}>
                  <MoneyField data-room={r.id} value={forms[r.id].debt} placeholder="0" onChange={(v) => setF(r.id, { debt: v })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={inpT} />
                  {r.auto.debt > 0 && <div className="mt-0.5 text-right text-[10px] leading-tight text-gray-400">kỳ trước còn {vnd(r.auto.debt)}</div>}
                </td>
              ))}
            </Row>
            <Row label="Tổng cần nộp" strong tone="total" tot={<span className="text-base font-extrabold">{T(sumBy(totalOf))}</span>}>
              {rooms.map((r) => {
                const inv = invs[r.id];
                const total = inv && !dirty(r) ? inv.total : calc(r).total;
                return <td key={r.id} className={`${cell} bg-brand-50 text-right text-base font-extrabold`}>{vnd(total)}</td>;
              })}
            </Row>
            <Row label="Đã thanh toán" tot={<span className="text-green-700">{T(sumBy(paidOf))}</span>}>{rooms.map((r) => <td key={r.id} className={`${cell} text-right text-green-700`}>{invs[r.id] ? vnd(invs[r.id]!.paid) : "—"}</td>)}</Row>
            <Row label="Còn nợ" strong tone="total" tot={<span className="font-extrabold text-red-700">{T(sumBy((r) => Math.max(0, totalOf(r) - (invs[r.id]?.paid ?? 0))))}</span>}>
              {rooms.map((r) => {
                const inv = invs[r.id];
                const total = inv && !dirty(r) ? inv.total : calc(r).total;
                const remain = Math.max(0, total - (inv?.paid ?? 0));
                return <td key={r.id} className={`${cell} text-right font-bold ${remain > 0 ? "text-red-700" : "text-green-700"}`}>{vnd(remain)}</td>;
              })}
            </Row>
            <Row label="Gửi khách">
              {rooms.map((r) => {
                const inv = invs[r.id];
                const st = status[r.id];
                const path = inv ? `/pay/${inv.token}` : "";
                const remain = inv ? Math.max(0, inv.total - inv.paid) : 0;
                const msg = `Chào anh/chị phòng ${r.code}, hóa đơn tiền trọ tháng ${mm} là ${vnd(remain || (inv?.total ?? 0))}. Xem chi tiết và quét QR chuyển khoản: {link}`;
                return (
                  <td key={r.id} className={cell}>
                    <div className={`mb-1 text-[11px] ${st?.state === "error" ? "font-medium text-red-700" : st?.state === "saving" ? "text-gray-500" : "text-green-700"}`}>{st?.msg ?? (inv ? "" : "Chưa có hóa đơn: nhập số điện mới")}</div>
                    {inv && !dirty(r) ? (
                      <div className="flex flex-wrap gap-1">
                        <CopyButton path={path} message={msg} label={r.phone ? "Chép tin & mở Zalo" : "Chép tin nhắn"} primary zaloPhone={r.phone} />
                        <CopyButton path={path} label="Chép link" />
                        <Link href={path} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Xem hóa đơn</Link>
                        <Link href={`/invoices/${inv.id}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Thu tiền</Link>
                      </div>
                    ) : inv ? <div className="text-[11px] text-gray-500">Đang chờ lưu…</div> : null}
                  </td>
                );
              })}
            </Row>
            <Row label="Ghi chú">{rooms.map((r) => <td key={r.id} className={cell}>{noteBox(r.id, "w-full")}</td>)}</Row>
          </tbody>
        </table>
      </div>
      <MonthExtras key={JSON.stringify(ledger)} month={month} thu={thu} ledger={ledger} roomCosts={roomCosts} />

      {vacant.length > 0 && <p className="text-xs text-gray-500">Phòng đang trống: {vacant.join(", ")}.</p>}
      {rooms.some((r) => invs[r.id]?.locked) && <p className="text-xs text-brand-700">Hóa đơn ghi &quot;(từ sheet)&quot; được nhập từ sheet cũ. Sửa ô nào trong cột đó thì hóa đơn được tính lại theo giá hiện tại của phòng.</p>}

      {editing && <RoomEditor room={editing} month={month} services={services} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

type Tone = "elec" | "water" | "svc" | "rent" | "misc" | "total";
const TONE_LABEL: Record<Tone, string> = {
  elec: "border-l-4 border-l-amber-400 text-amber-900",
  water: "border-l-4 border-l-sky-400 text-sky-900",
  svc: "border-l-4 border-l-violet-400 text-violet-900",
  rent: "border-l-4 border-l-teal-400 text-teal-900",
  misc: "border-l-4 border-l-gray-300 text-gray-700",
  total: "border-l-4 border-l-brand-600 text-brand-900",
};
const TONE_LABEL_BG: Record<Tone, string> = { elec: "bg-amber-50", water: "bg-sky-50", svc: "bg-violet-50", rent: "bg-teal-50", misc: "bg-gray-50", total: "bg-brand-100" };
const TONE_CALC_LABEL_BG: Record<Tone, string> = { elec: "bg-amber-100", water: "bg-sky-100", svc: "bg-violet-100", rent: "bg-teal-100", misc: "bg-gray-100", total: "bg-brand-100" };
const TONE_CALC_ROW: Record<Tone, string> = { elec: "bg-amber-50/90", water: "bg-sky-50/90", svc: "bg-violet-50/90", rent: "bg-teal-50/90", misc: "bg-gray-50", total: "bg-brand-50" };

function Row({ label, children, calc, strong, tot, tone = "misc" }: { label: string; children: React.ReactNode; calc?: boolean; strong?: boolean; tot?: React.ReactNode; tone?: Tone }) {
  return (
    <tr className={calc ? TONE_CALC_ROW[tone] : ""}>
      <th className={`${labelCell} ${calc ? TONE_CALC_LABEL_BG[tone] : TONE_LABEL_BG[tone]} ${TONE_LABEL[tone]} ${calc || strong ? "text-[12px] font-extrabold" : ""}`}>{label}</th>
      {children}
      <td className={`whitespace-nowrap border-b border-l border-gray-100 px-1.5 py-0.5 text-right align-middle tabular-nums ${calc ? "bg-white/60 text-[15px] font-bold" : "bg-brand-50/70 text-[13px] font-semibold"}`}>{tot ?? ""}</td>
    </tr>
  );
}

function Num({ r, f, k, setF, commit, onKey, step, right, placeholder }: {
  r: RoomView; f: Form; k: "people" | "rent" | "elecOld" | "waterOld" | "discount";
  setF: (id: number, p: Partial<Form>) => void; commit: (id: number) => void; onKey: (e: React.KeyboardEvent<HTMLElement>, id: number) => void;
  step?: string; right?: boolean; placeholder?: string;
}) {
  if (k === "rent" || k === "discount") {
    return (
      <td className={cell}>
        <MoneyField data-room={r.id} value={f[k]} placeholder={placeholder} onChange={(v) => setF(r.id, { [k]: v } as Partial<Form>)} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={inpT} />
      </td>
    );
  }
  const unit = k === "elecOld" ? "kWh" : k === "waterOld" ? "m³" : k === "people" ? "người" : "";
  return (
    <td className={cell}>
      <div className="relative">
        <input type="number" min="0" step={step} inputMode="decimal" data-room={r.id} value={f[k]} placeholder={placeholder}
          onChange={(e) => setF(r.id, { [k]: e.target.value } as Partial<Form>)} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)}
          className={`${inpT} tabular-nums ${unit ? "pr-9" : ""} ${right ? "text-right" : ""}`} />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-gray-400">{unit}</span>}
      </div>
    </td>
  );
}
