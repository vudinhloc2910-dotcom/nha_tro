"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveRoomMonth, saveRoomProfile, type RoomMonthInput, type SaveResult } from "./actions";
import { StatusBadge } from "./components";
import { CopyButton } from "./copy-button";
import { computeInvoice, svcAuto, type RoomInput } from "@/lib/calc";
import { statusOf, vnd } from "@/lib/format";
import type { RoomView } from "@/lib/monthdata";

type Svc = { id: number; name: string; type: "room" | "person"; price: number };
type Form = {
  periodStart: string; periodEnd: string; people: string; rent: string;
  elecOld: string; elecNew: string; waterOld: string; waterNew: string;
  svc: Record<number, string>; extras: { name: string; amount: string }[]; discount: string; debt: string;
};
type Inv = { id: number; token: string; total: number; paid: number; due: string; locked: boolean } | null;
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
    people: Math.max(1, Math.round(num(f.people) ?? 1)), rent: num(f.rent) ?? 0,
    elecOld: num(f.elecOld) ?? 0, elecNew: num(f.elecNew), elecPrice: r.input.elecPrice,
    waterMode, waterOld: num(f.waterOld) ?? 0, waterNew: num(f.waterNew), waterPrice: r.input.waterPrice,
    services: r.input.services.map((s) => ({ ...s, amount: num(f.svc[s.id] ?? "") })),
    extras: f.extras.map((e) => ({ name: e.name.trim(), amount: num(e.amount) ?? 0 })).filter((e) => e.name && e.amount),
    discount: Math.abs(num(f.discount) ?? 0), debt: num(f.debt) ?? 0,
    periodStart: f.periodStart, periodEnd: f.periodEnd,
  };
}

const cell = "border-b border-gray-100 px-2 py-1.5 align-top";
const labelCell = "sticky left-0 z-10 w-36 min-w-[9rem] border-b border-gray-100 bg-gray-50 px-2 py-1.5 text-xs font-semibold uppercase text-gray-600";
const inp = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";

export function MonthGrid({ month, houseName, waterMode, services, rooms, vacant }: {
  month: string; houseName: string; waterMode: "meter" | "person"; services: Svc[]; rooms: RoomView[]; vacant: string[];
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
  const mm = month.slice(5);

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
      roomId: id, month, people: f.people, rent: f.rent, periodStart: f.periodStart, periodEnd: f.periodEnd,
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
    if (t.tagName !== "INPUT" || (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const list = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-room="${id}"]:not([disabled])`));
    const at = list.indexOf(t as HTMLInputElement);
    const next = list[at + (e.key === "ArrowUp" ? -1 : 1)];
    if (next) { e.preventDefault(); next.focus(); next.select?.(); }
  }

  const calc = (r: RoomView) => computeInvoice(buildInput(r, forms[r.id], waterMode));
  const dirty = (r: RoomView) => JSON.stringify(forms[r.id]) !== saved.current[r.id];

  const totals = rooms.reduce((a, r) => {
    const inv = invs[r.id];
    const total = inv && !dirty(r) ? inv.total : calc(r).total;
    return { total: a.total + total, paid: a.paid + Math.min(inv?.paid ?? 0, total) };
  }, { total: 0, paid: 0 });

  if (rooms.length === 0) return <p className="text-sm text-gray-600">Nhà này chưa có phòng nào có khách thuê. Thêm phòng và khách ở mục Phòng, hoặc nhập dữ liệu cũ ở Khác → Nhập dữ liệu sheet.</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[["Phải thu", vnd(totals.total), ""], ["Đã thu", vnd(totals.paid), "text-green-700"], ["Còn nợ", vnd(totals.total - totals.paid), totals.total - totals.paid > 0 ? "text-red-700" : ""]].map(([l, v, c]) => (
          <div key={l} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"><div className="text-xs text-gray-500">{l}</div><div className={`mt-1 text-base font-bold sm:text-lg ${c}`}>{v}</div></div>
        ))}
      </div>
      <p className="text-xs text-gray-600">
        Gõ vào ô rồi bấm <b>Enter</b> (xuống ô dưới) hoặc <b>Tab</b> (sang ô kế). <b>Tự lưu</b> khi rời ô, tiền tự tính ngay. Ô chữ mờ là số tự động, gõ số khác để đặt riêng cho phòng đó.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${labelCell} top-0`}>{houseName}</th>
              {rooms.map((r) => {
                const inv = invs[r.id];
                const st = inv ? statusOf(inv.total, inv.paid, inv.due) : null;
                return (
                  <th key={r.id} className="min-w-[10.5rem] border-b border-gray-200 bg-gray-50 px-2 py-2 text-left align-top">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold">Phòng {r.code}</span>
                      <button type="button" onClick={() => setEditing(r)} className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-50">Sửa</button>
                    </div>
                    <div className="truncate text-xs font-normal text-gray-600" title={r.tenantName}>{r.tenantName}{r.phone ? ` · ${r.phone}` : ""}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {st && <StatusBadge status={st} />}
                      {inv?.locked && !dirty(r) ? <span className="text-[11px] font-normal text-blue-700">(từ sheet)</span> : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <Row label="Kỳ hạn thuê">
              {rooms.map((r) => (
                <td key={r.id} className={cell}>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-[11px] text-gray-500">Từ<input type="date" data-room={r.id} value={forms[r.id].periodStart} onChange={(e) => setF(r.id, { periodStart: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} text-xs`} /></label>
                    <label className="flex items-center gap-1 text-[11px] text-gray-500">Đến<input type="date" data-room={r.id} value={forms[r.id].periodEnd} onChange={(e) => setF(r.id, { periodEnd: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} text-xs`} /></label>
                  </div>
                </td>
              ))}
            </Row>
            <Row label="Số người">
              {rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="people" setF={setF} commit={commit} onKey={onKey} />)}
            </Row>
            <Row label="Điện cũ">{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="elecOld" setF={setF} commit={commit} onKey={onKey} step="0.1" />)}</Row>
            <Row label="Điện mới">
              {rooms.map((r) => {
                const f = forms[r.id];
                const o = num(f.elecOld) ?? 0, n = num(f.elecNew);
                const used = n === null ? null : n - o;
                const warn = used !== null && used < 0 ? "Nhỏ hơn số cũ" : used !== null && r.prevUsage && r.prevUsage.e > 20 && used > r.prevUsage.e * 3 ? `Tăng bất thường (tháng trước ${Math.round(r.prevUsage.e)} kWh)` : "";
                return (
                  <td key={r.id} className={cell}>
                    <input type="number" step="0.1" min="0" inputMode="decimal" data-room={r.id} value={f.elecNew} placeholder="Nhập số mới" onChange={(e) => setF(r.id, { elecNew: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} ${used !== null && used < 0 ? "border-red-500 bg-red-50" : warn ? "border-amber-500 bg-amber-50" : ""}`} />
                    {used !== null && used >= 0 && <div className="mt-0.5 text-[11px] text-gray-500">Dùng {Math.round(used * 10) / 10} kWh</div>}
                    {warn && <div className={`mt-0.5 text-[11px] ${used! < 0 ? "text-red-700" : "text-amber-700"}`}>⚠ {warn}</div>}
                  </td>
                );
              })}
            </Row>
            <Row label="Tiền điện" calc>{rooms.map((r) => { const f = forms[r.id]; const c = calc(r); return <td key={r.id} className={`${cell} text-right`}>{num(f.elecNew) === null ? <span className="text-gray-400">—</span> : vnd(c.elec)}<div className="text-[11px] text-gray-400">{vnd(r.input.elecPrice)}/kWh</div></td>; })}</Row>
            {waterMode === "meter" ? (
              <>
                <Row label="Nước cũ">{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="waterOld" setF={setF} commit={commit} onKey={onKey} step="0.1" />)}</Row>
                <Row label="Nước mới">
                  {rooms.map((r) => {
                    const f = forms[r.id];
                    const o = num(f.waterOld) ?? 0, n = num(f.waterNew);
                    const used = n === null ? null : n - o;
                    return (
                      <td key={r.id} className={cell}>
                        <input type="number" step="0.1" min="0" inputMode="decimal" data-room={r.id} value={f.waterNew} placeholder="Nhập số mới" onChange={(e) => setF(r.id, { waterNew: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} ${used !== null && used < 0 ? "border-red-500 bg-red-50" : ""}`} />
                        {used !== null && used >= 0 && <div className="mt-0.5 text-[11px] text-gray-500">Dùng {Math.round(used * 10) / 10} m³</div>}
                        {used !== null && used < 0 && <div className="mt-0.5 text-[11px] text-red-700">⚠ Nhỏ hơn số cũ</div>}
                      </td>
                    );
                  })}
                </Row>
              </>
            ) : null}
            <Row label="Tiền nước" calc>{rooms.map((r) => { const c = calc(r); const f = forms[r.id]; return <td key={r.id} className={`${cell} text-right`}>{waterMode === "meter" && num(f.waterNew) === null ? <span className="text-gray-400">—</span> : vnd(c.water)}<div className="text-[11px] text-gray-400">{waterMode === "person" ? `${vnd(r.input.waterPrice)}/người` : `${vnd(r.input.waterPrice)}/m³`}</div></td>; })}</Row>
            {services.map((s) => (
              <Row key={s.id} label={s.name}>
                {rooms.map((r) => {
                  const sv = r.input.services.find((x) => x.id === s.id)!;
                  const f = forms[r.id];
                  const auto = svcAuto(sv, Math.max(1, Math.round(num(f.people) ?? 1)));
                  if (sv.off) return <td key={r.id} className={`${cell} text-center text-xs text-gray-400`}>Không thu</td>;
                  return (
                    <td key={r.id} className={cell}>
                      <input type="number" min="0" inputMode="numeric" data-room={r.id} value={f.svc[s.id] ?? ""} placeholder={String(auto)} onChange={(e) => setF(r.id, { svc: { ...f.svc, [s.id]: e.target.value } })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} text-right`} />
                      <div className="mt-0.5 text-right text-[11px] text-gray-400">{sv.type === "person" ? `${vnd(sv.unit)}/người` : "theo phòng"}</div>
                    </td>
                  );
                })}
              </Row>
            ))}
            <Row label="Tiền phòng">{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="rent" setF={setF} commit={commit} onKey={onKey} right />)}</Row>
            <Row label="Phụ phí phát sinh">
              {rooms.map((r) => {
                const f = forms[r.id];
                const setExtras = (extras: Form["extras"], save = false) => { latest.current = { ...latest.current, [r.id]: { ...latest.current[r.id], extras } }; setF(r.id, { extras }); if (save) setTimeout(() => commit(r.id), 0); };
                return (
                  <td key={r.id} className={cell}>
                    <div className="space-y-1">
                      {f.extras.map((e, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <input data-room={r.id} value={e.name} placeholder="Tên khoản" onChange={(ev) => setExtras(f.extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} onBlur={() => commit(r.id)} onKeyDown={(ev) => onKey(ev, r.id)} className={`${inp} min-w-0 flex-1`} />
                          <input data-room={r.id} type="number" value={e.amount} placeholder="Tiền" onChange={(ev) => setExtras(f.extras.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} onBlur={() => commit(r.id)} onKeyDown={(ev) => onKey(ev, r.id)} className={`${inp} w-24 text-right`} />
                          <button type="button" aria-label="Xóa khoản" onClick={() => setExtras(f.extras.filter((_, j) => j !== i), true)} className="px-1 text-gray-400 hover:text-red-600">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setExtras([...f.extras, { name: "", amount: "" }])} className="text-xs font-medium text-blue-700 hover:underline">+ Thêm khoản</button>
                    </div>
                  </td>
                );
              })}
            </Row>
            <Row label="Giảm giá">{rooms.map((r) => <Num key={r.id} r={r} f={forms[r.id]} k="discount" setF={setF} commit={commit} onKey={onKey} right placeholder="0" />)}</Row>
            <Row label="Nợ cũ">
              {rooms.map((r) => (
                <td key={r.id} className={cell}>
                  <input type="number" min="0" inputMode="numeric" data-room={r.id} value={forms[r.id].debt} placeholder="0" onChange={(e) => setF(r.id, { debt: e.target.value })} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)} className={`${inp} text-right`} />
                  {r.auto.debt > 0 && <div className="mt-0.5 text-right text-[11px] text-gray-400">kỳ trước còn {vnd(r.auto.debt)}</div>}
                </td>
              ))}
            </Row>
            <Row label="Tổng cần nộp" strong>
              {rooms.map((r) => {
                const inv = invs[r.id];
                const total = inv && !dirty(r) ? inv.total : calc(r).total;
                return <td key={r.id} className={`${cell} bg-blue-50 text-right text-base font-extrabold`}>{vnd(total)}</td>;
              })}
            </Row>
            <Row label="Đã thanh toán">{rooms.map((r) => <td key={r.id} className={`${cell} text-right text-green-700`}>{invs[r.id] ? vnd(invs[r.id]!.paid) : "—"}</td>)}</Row>
            <Row label="Còn nợ" strong>
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
                        <CopyButton path={path} message={msg} label="Chép tin nhắn" primary />
                        <CopyButton path={path} label="Chép link" />
                        <Link href={path} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Xem hóa đơn</Link>
                        <Link href={`/invoices/${inv.id}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Thu tiền</Link>
                      </div>
                    ) : inv ? <div className="text-[11px] text-gray-500">Đang chờ lưu…</div> : null}
                  </td>
                );
              })}
            </Row>
          </tbody>
        </table>
      </div>
      {vacant.length > 0 && <p className="text-xs text-gray-500">Phòng đang trống: {vacant.join(", ")}.</p>}
      {rooms.some((r) => invs[r.id]?.locked) && <p className="text-xs text-blue-700">Hóa đơn ghi &quot;(từ sheet)&quot; được nhập từ sheet cũ. Sửa ô nào trong cột đó thì hóa đơn được tính lại theo giá hiện tại của phòng.</p>}

      {editing && <RoomEditor room={editing} month={month} services={services} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function Row({ label, children, calc, strong }: { label: string; children: React.ReactNode; calc?: boolean; strong?: boolean }) {
  return (
    <tr className={calc ? "bg-gray-50/60" : ""}>
      <th className={`${labelCell} ${strong ? "text-gray-900" : ""}`}>{label}</th>
      {children}
    </tr>
  );
}

function Num({ r, f, k, setF, commit, onKey, step, right, placeholder }: {
  r: RoomView; f: Form; k: "people" | "rent" | "elecOld" | "waterOld" | "discount";
  setF: (id: number, p: Partial<Form>) => void; commit: (id: number) => void; onKey: (e: React.KeyboardEvent<HTMLElement>, id: number) => void;
  step?: string; right?: boolean; placeholder?: string;
}) {
  return (
    <td className={cell}>
      <input type="number" min="0" step={step} inputMode="decimal" data-room={r.id} value={f[k]} placeholder={placeholder}
        onChange={(e) => setF(r.id, { [k]: e.target.value } as Partial<Form>)} onBlur={() => commit(r.id)} onKeyDown={(e) => onKey(e, r.id)}
        className={`${inp} ${right ? "text-right" : ""}`} />
    </td>
  );
}

/** Ô "Sửa": toàn bộ thông tin cố định của một phòng (tên, điện thoại, giá phòng, giá riêng, dịch vụ riêng...). */
function RoomEditor({ room, month, services, onClose, onSaved }: { room: RoomView; month: string; services: Svc[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: room.code, tenantName: room.tenantName, phone: room.phone, people: String(room.tenantPeople), rent: String(room.rent),
    dueDay: String(room.dueDay), note: room.note, elecPrice: s2(room.prefs.elecPrice), waterPrice: s2(room.prefs.waterPrice),
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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

        <h3 className="mb-1 mt-5 text-sm font-semibold">Đơn giá riêng của phòng</h3>
        <p className="mb-2 text-xs text-gray-500">Để trống = dùng giá chung của nhà.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={L}>Giá điện (đ/kWh)</label><input className={inp} type="number" min="0" value={f.elecPrice} placeholder={String(room.input.elecPrice)} onChange={(e) => set("elecPrice", e.target.value)} /></div>
          <div><label className={L}>Giá nước ({room.input.waterMode === "person" ? "đ/người" : "đ/m³"})</label><input className={inp} type="number" min="0" value={f.waterPrice} placeholder={String(room.input.waterPrice)} onChange={(e) => set("waterPrice", e.target.value)} /></div>
        </div>

        {services.length > 0 && (
          <>
            <h3 className="mb-1 mt-5 text-sm font-semibold">Dịch vụ của phòng</h3>
            <div className="space-y-2">
              {services.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
                  <span className="text-sm">{s.name} <span className="text-xs text-gray-500">({s.type === "person" ? "theo người" : "theo phòng"})</span></span>
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
          <button type="button" onClick={save} disabled={busy} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}
