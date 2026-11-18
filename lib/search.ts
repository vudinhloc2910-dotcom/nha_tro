import { readAll } from "./db";
import { statusOf, STATUS_LABEL, vnd, monthLabel, type Status } from "./format";

export type SearchType = "room" | "tenant" | "resident" | "vehicle" | "invoice" | "issue" | "ledger";
export const TYPE_LABEL: Record<SearchType, string> = {
  room: "Phòng", tenant: "Khách thuê", resident: "Người ở (CCCD)", vehicle: "Xe", invoice: "Hóa đơn", issue: "Sự cố", ledger: "Sổ thu chi",
};
export type SearchParams = {
  q: string; type: SearchType | "all"; house: number | null; from: string; to: string; status: Status | ""; min: number | null; max: number | null;
  /** Lọc phòng theo giá: chuỗi như "3500", "3500, 3800" hoặc "3500-4000" */
  elec: string; water: string; svc: string; svcPrice: string;
};
export type Hit = { type: SearchType; id: number; title: string; sub: string; href: string; house: string; month?: string; amount?: number; status?: Status };
export type SearchResult = { groups: { type: SearchType; hits: Hit[]; total: number }[]; total: number };

/** Bỏ dấu tiếng Việt và chữ hoa để gõ "nha chu" vẫn ra "Nhà chủ". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
const has = (hay: string[], needles: string[]) => { const h = fold(hay.join(" \u0001 ")); return needles.every((n) => h.includes(n)); };

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const lastDayOf = (m: string) => `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
/** Ngày yyyy-mm-dd; link cũ chỉ có yyyy-mm thì hiểu là đầu / cuối tháng. */
function parseDate(v: string | undefined, end: boolean): string {
  if (DATE_RE.test(v ?? "")) return v!;
  if (MONTH_RE.test(v ?? "")) return end ? lastDayOf(v!) : `${v}-01`;
  return "";
}
export type PriceTest = (n: number) => boolean;
/** "3500", "3.500, 3800", "3500-4000" -> hàm kiểm tra; rỗng -> null */
export function priceTest(raw: string): PriceTest | null {
  const parts = raw.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const tests: [number, number][] = [];
  for (const p of parts) {
    const m = /^([\d.\s]+)?\s*(?:-|–|đến)\s*([\d.\s]+)?$/.exec(p);
    const n = (s?: string) => { const d = (s ?? "").replace(/\D/g, ""); return d === "" ? null : Number(d); };
    if (m && (n(m[1]) !== null || n(m[2]) !== null)) tests.push([n(m[1]) ?? 0, n(m[2]) ?? Infinity]);
    else { const v = n(p); if (v !== null) tests.push([v, v]); }
  }
  return tests.length ? (x) => tests.some(([a, b]) => x >= a && x <= b) : null;
}
export function parseParams(sp: Record<string, string | undefined>): SearchParams {
  const num = (v?: string) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n; };
  const types = Object.keys(TYPE_LABEL);
  const st = ["paid", "partial", "unpaid", "overdue"];
  return {
    q: (sp.q ?? "").trim().slice(0, 100),
    type: types.includes(sp.type ?? "") ? (sp.type as SearchType) : "all",
    house: sp.house && /^\d+$/.test(sp.house) ? Number(sp.house) : null,
    from: parseDate(sp.from, false), to: parseDate(sp.to, true),
    status: st.includes(sp.status ?? "") ? (sp.status as Status) : "",
    min: num(sp.min), max: num(sp.max),
    elec: (sp.elec ?? "").trim().slice(0, 60), water: (sp.water ?? "").trim().slice(0, 60),
    svc: (sp.svc ?? "").trim().slice(0, 60), svcPrice: (sp.svcPrice ?? "").trim().slice(0, 60),
  };
}
/** Có điều kiện lọc nào chưa (ngoài từ khóa)? */
export const hasFilters = (p: SearchParams) => p.type !== "all" || p.house !== null || !!p.from || !!p.to || !!p.status || p.min !== null || p.max !== null || !!p.elec || !!p.water || !!p.svc || !!p.svcPrice;

/**
 * Tìm trên TẤT CẢ các nhà: phòng, khách, người ở, xe, hóa đơn, sự cố, sổ thu chi.
 * Từ khóa tách bằng dấu cách, mọi từ đều phải có (không phân biệt hoa thường, dấu). Bộ lọc áp dụng cho loại dữ liệu có trường đó.
 */
export async function runSearch(p: SearchParams, limit = 100): Promise<SearchResult> {
  const needles = fold(p.q).split(/\s+/).filter(Boolean);
  const want = (t: SearchType) => p.type === "all" || p.type === t;
  const [roomR, tenR, resR, vehR, invR, issR, ledR, prefR, svcR, setR] = await readAll([
    { sql: `SELECT r.id, r.code, r.note, r.floor_label, r.kind, r.rent, h.id hid, h.name house,
              (SELECT name FROM tenants t WHERE t.room_id=r.id AND t.active=1 LIMIT 1) tenant,
              (SELECT group_concat(note, ' ') FROM (SELECT value note FROM room_month m WHERE m.room_id=r.id AND m.key='note' LIMIT 12)) mnotes
            FROM rooms r JOIN houses h ON h.id=r.house_id` },
    { sql: `SELECT t.id, t.name, t.phone, t.active, t.move_in, t.move_out, t.deposit, r.id rid, r.code, h.id hid, h.name house
            FROM tenants t JOIN rooms r ON r.id=t.room_id JOIN houses h ON h.id=r.house_id` },
    { sql: `SELECT x.id, x.room_code, x.name, x.cccd, x.phone, x.job, x.address, x.plate, x.vehicle, x.emergency, h.id hid, h.name house
            FROM residents x JOIN houses h ON h.id=x.house_id` },
    { sql: `SELECT v.id, v.kind, v.plate, v.note, r.id rid, r.code, h.id hid, h.name house
            FROM vehicles v JOIN rooms r ON r.id=v.room_id JOIN houses h ON h.id=r.house_id` },
    { sql: `SELECT i.id, i.month, i.tenant_name, i.total, i.due_date, i.period_start, i.state, r.code, h.id hid, h.name house,
              COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
            FROM invoices i JOIN rooms r ON r.id=i.room_id JOIN houses h ON h.id=r.house_id` },
    { sql: `SELECT s.id, s.title, s.detail, s.status, s.cost, s.created, r.code, h.id hid, h.name house
            FROM issues s JOIN houses h ON h.id=s.house_id LEFT JOIN rooms r ON r.id=s.room_id` },
    { sql: `SELECT l.id, l.month, l.kind, l.category, l.name, l.amount, h.id hid, h.name house
            FROM ledger l JOIN houses h ON h.id=l.house_id` },
    { sql: "SELECT room_id, key, value FROM room_prefs WHERE key IN ('elec_price','water_price') OR key LIKE 'svc:%' OR key LIKE 'svc_off:%'" },
    { sql: "SELECT id, house_id, name, price, room_id FROM services WHERE active=1" },
    { sql: "SELECT house_id, key, value FROM house_settings WHERE key IN ('elec_price','water_price')" },
  ]);
  const okHouse = (hid: number) => p.house === null || p.house === hid;
  const okMonth = (m: string) => (!p.from || m >= p.from.slice(0, 7)) && (!p.to || m <= p.to.slice(0, 7));
  const okDate = (d: string) => (!p.from || d >= p.from) && (!p.to || d <= p.to);
  const okAmount = (a: number) => (p.min === null || a >= p.min) && (p.max === null || a <= p.max);
  const q = (s: unknown) => String(s ?? "");

  const hits: Hit[] = [];
  const push = (h: Hit) => hits.push(h);
  // Khi có lọc theo tháng / trạng thái / số tiền thì các loại không có trường đó (phòng, khách, xe...) không hiện, tránh kết quả nhiễu
  const strictOther = !!p.from || !!p.to || !!p.status || p.min !== null || p.max !== null;
  const tE = priceTest(p.elec), tW = priceTest(p.water), tS = priceTest(p.svcPrice);
  const svcNeedles = fold(p.svc).split(/\s+/).filter(Boolean);
  // Lọc theo giá điện / nước / dịch vụ chỉ áp dụng cho phòng, nên chỉ hiện phòng
  const priceActive = !!(tE || tW || tS || svcNeedles.length);
  const strict = strictOther || priceActive;
  const prefs = new Map<string, string>();
  for (const x of prefR as Record<string, unknown>[]) prefs.set(`${x.room_id}|${x.key}`, q(x.value));
  const hset = new Map<string, number>();
  for (const x of setR as Record<string, unknown>[]) hset.set(`${x.house_id}|${x.key}`, Number(x.value) || 0);
  const svcAll = svcR as Record<string, unknown>[];
  const numOr = (v: string | undefined, d: number) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

  if (want("room") && (!strictOther || priceActive)) for (const r of roomR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    const eP = numOr(prefs.get(`${r.id}|elec_price`), hset.get(`${r.hid}|elec_price`) ?? 0);
    const wP = numOr(prefs.get(`${r.id}|water_price`), hset.get(`${r.hid}|water_price`) ?? 0);
    const rs = svcAll.filter((s) => Number(s.house_id) === Number(r.hid) && (s.room_id === null || s.room_id === undefined || Number(s.room_id) === Number(r.id)) && prefs.get(`${r.id}|svc_off:${s.id}`) !== "1")
      .map((s) => ({ name: q(s.name), price: numOr(prefs.get(`${r.id}|svc:${s.id}`), Number(s.price) || 0) }));
    if (tE && !tE(eP)) continue;
    if (tW && !tW(wP)) continue;
    if ((tS || svcNeedles.length) && !rs.some((s) => (svcNeedles.length === 0 || svcNeedles.every((n) => fold(s.name).includes(n))) && (!tS || tS(s.price)))) continue;
    if (!has([q(r.code), q(r.note), q(r.floor_label), q(r.kind), q(r.tenant), q(r.mnotes), q(r.house)], needles)) continue;
    const priceInfo = priceActive ? [`Điện ${vnd(eP)}/kWh`, `Nước ${vnd(wP)}`, ...rs.map((s) => `${s.name} ${vnd(s.price)}`)].join(" · ") : "";
    push({ type: "room", id: Number(r.id), title: `Phòng ${q(r.code)}`, sub: [r.tenant ? `Khách: ${q(r.tenant)}` : "Phòng trống", r.rent ? vnd(Number(r.rent)) : "", priceInfo, q(r.note) || q(r.mnotes)].filter(Boolean).join(" · "), href: `/rooms/${r.id}`, house: q(r.house) });
  }
  if (want("tenant") && !strict) for (const r of tenR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    if (!has([q(r.name), q(r.phone), q(r.code), q(r.house)], needles)) continue;
    push({ type: "tenant", id: Number(r.id), title: q(r.name), sub: `Phòng ${q(r.code)} · ${r.active ? "đang ở" : `đã trả phòng ${q(r.move_out)}`}${r.phone ? ` · ${q(r.phone)}` : ""}`, href: `/rooms/${r.rid}?tab=${r.active ? "info" : "history"}`, house: q(r.house) });
  }
  if (want("resident") && !strict) for (const r of resR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    if (!has([q(r.name), q(r.cccd), q(r.phone), q(r.room_code), q(r.job), q(r.address), q(r.plate), q(r.vehicle), q(r.emergency), q(r.house)], needles)) continue;
    push({ type: "resident", id: Number(r.id), title: q(r.name) || "(chưa có tên)", sub: [`Phòng ${q(r.room_code)}`, r.cccd ? `CCCD ${q(r.cccd)}` : "", r.phone ? q(r.phone) : "", r.plate ? `Biển ${q(r.plate)}` : ""].filter(Boolean).join(" · "), href: "/tenants", house: q(r.house) });
  }
  if (want("vehicle") && !strict) for (const r of vehR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    if (!has([q(r.plate), q(r.kind), q(r.note), q(r.code), q(r.house)], needles)) continue;
    push({ type: "vehicle", id: Number(r.id), title: `${q(r.kind)} ${q(r.plate)}`.trim(), sub: `Phòng ${q(r.code)}${r.note ? ` · ${q(r.note)}` : ""}`, href: `/rooms/${r.rid}`, house: q(r.house) });
  }
  if (want("invoice") && !priceActive) for (const r of invR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    // Lọc theo ngày: kỳ thu (từ ngày bắt đầu đến hạn đóng) giao với khoảng ngày đã chọn
    const dEnd = q(r.due_date) || `${q(r.month)}-28`, dStart = q(r.period_start) || dEnd;
    if (p.from || p.to) { if ((p.to && dStart > p.to) || (p.from && dEnd < p.from)) continue; }
    const total = Number(r.total), paid = Number(r.paid);
    const st = statusOf(total, paid, q(r.due_date), q(r.state));
    if (p.status && st !== p.status) continue;
    if (!okAmount(total)) continue;
    // Gõ "10/2026" hoặc "2026-10" đều khớp tháng
    if (!has([q(r.tenant_name), `phong ${q(r.code)}`, q(r.house), q(r.month), monthLabel(q(r.month)), STATUS_LABEL[st], String(total)], needles)) continue;
    push({ type: "invoice", id: Number(r.id), title: `Hóa đơn ${monthLabel(q(r.month))} · Phòng ${q(r.code)}`, sub: `${q(r.tenant_name)} · ${vnd(total)} · đã thu ${vnd(paid)}`, href: `/invoices/${r.id}`, house: q(r.house), month: q(r.month), amount: total, status: st });
  }
  if (want("issue") && !p.status && !priceActive) for (const r of issR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    const month = q(r.created).slice(0, 7);
    if (!okDate(q(r.created).slice(0, 10))) continue;
    const cost = Number(r.cost) || 0;
    if (!okAmount(cost) && (p.min !== null || p.max !== null)) continue;
    if (!has([q(r.title), q(r.detail), q(r.code), q(r.house), q(r.status)], needles)) continue;
    push({ type: "issue", id: Number(r.id), title: q(r.title), sub: `${r.code ? `Phòng ${q(r.code)}` : "Chung cả nhà"} · ${q(r.status) === "done" ? "đã xong" : q(r.status) === "open" ? "mới báo" : "đang xử lý"}${cost ? ` · chi ${vnd(cost)}` : ""}`, href: "/issues", house: q(r.house), month, amount: cost || undefined });
  }
  if (want("ledger") && !p.status && !priceActive) for (const r of ledR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid)) || !okMonth(q(r.month))) continue;
    const amount = Number(r.amount) || 0;
    if (!okAmount(amount)) continue;
    if (!has([q(r.name), q(r.category), q(r.house), q(r.month), monthLabel(q(r.month)), String(amount), q(r.kind) === "thu" ? "thu" : "chi"], needles)) continue;
    push({ type: "ledger", id: Number(r.id), title: q(r.name) || q(r.category), sub: `${q(r.kind) === "thu" ? "Thu" : "Chi"} ${vnd(amount)} · tháng ${monthLabel(q(r.month))}`, href: "/ledger", house: q(r.house), month: q(r.month), amount });
  }

  const order: SearchType[] = ["room", "tenant", "resident", "vehicle", "invoice", "issue", "ledger"];
  const groups = order.map((type) => {
    const list = hits.filter((h) => h.type === type);
    if (type === "invoice" || type === "ledger" || type === "issue") list.sort((a, b) => (b.month ?? "").localeCompare(a.month ?? ""));
    return { type, hits: list.slice(0, limit), total: list.length };
  }).filter((g) => g.total > 0);
  return { groups, total: hits.length };
}
