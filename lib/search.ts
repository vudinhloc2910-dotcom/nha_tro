import { readAll } from "./db";
import { statusOf, STATUS_LABEL, vnd, monthLabel, type Status } from "./format";

export type SearchType = "room" | "tenant" | "resident" | "vehicle" | "invoice" | "issue" | "ledger";
export const TYPE_LABEL: Record<SearchType, string> = {
  room: "Phòng", tenant: "Khách thuê", resident: "Người ở (CCCD)", vehicle: "Xe", invoice: "Hóa đơn", issue: "Sự cố", ledger: "Sổ thu chi",
};
export type SearchParams = {
  q: string; type: SearchType | "all"; house: number | null; from: string; to: string; status: Status | ""; min: number | null; max: number | null;
};
export type Hit = { type: SearchType; id: number; title: string; sub: string; href: string; house: string; month?: string; amount?: number; status?: Status };
export type SearchResult = { groups: { type: SearchType; hits: Hit[]; total: number }[]; total: number };

/** Bỏ dấu tiếng Việt và chữ hoa để gõ "nha chu" vẫn ra "Nhà chủ". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
const has = (hay: string[], needles: string[]) => { const h = fold(hay.join(" \u0001 ")); return needles.every((n) => h.includes(n)); };

const MONTH_RE = /^\d{4}-\d{2}$/;
export function parseParams(sp: Record<string, string | undefined>): SearchParams {
  const num = (v?: string) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n; };
  const types = Object.keys(TYPE_LABEL);
  const st = ["paid", "partial", "unpaid", "overdue"];
  return {
    q: (sp.q ?? "").trim().slice(0, 100),
    type: types.includes(sp.type ?? "") ? (sp.type as SearchType) : "all",
    house: sp.house && /^\d+$/.test(sp.house) ? Number(sp.house) : null,
    from: MONTH_RE.test(sp.from ?? "") ? sp.from! : "", to: MONTH_RE.test(sp.to ?? "") ? sp.to! : "",
    status: st.includes(sp.status ?? "") ? (sp.status as Status) : "",
    min: num(sp.min), max: num(sp.max),
  };
}
/** Có điều kiện lọc nào chưa (ngoài từ khóa)? */
export const hasFilters = (p: SearchParams) => p.type !== "all" || p.house !== null || !!p.from || !!p.to || !!p.status || p.min !== null || p.max !== null;

/**
 * Tìm trên TẤT CẢ các nhà: phòng, khách, người ở, xe, hóa đơn, sự cố, sổ thu chi.
 * Từ khóa tách bằng dấu cách, mọi từ đều phải có (không phân biệt hoa thường, dấu). Bộ lọc áp dụng cho loại dữ liệu có trường đó.
 */
export async function runSearch(p: SearchParams, limit = 100): Promise<SearchResult> {
  const needles = fold(p.q).split(/\s+/).filter(Boolean);
  const want = (t: SearchType) => p.type === "all" || p.type === t;
  const [roomR, tenR, resR, vehR, invR, issR, ledR] = await readAll([
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
    { sql: `SELECT i.id, i.month, i.tenant_name, i.total, i.due_date, i.state, r.code, h.id hid, h.name house,
              COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
            FROM invoices i JOIN rooms r ON r.id=i.room_id JOIN houses h ON h.id=r.house_id` },
    { sql: `SELECT s.id, s.title, s.detail, s.status, s.cost, s.created, r.code, h.id hid, h.name house
            FROM issues s JOIN houses h ON h.id=s.house_id LEFT JOIN rooms r ON r.id=s.room_id` },
    { sql: `SELECT l.id, l.month, l.kind, l.category, l.name, l.amount, h.id hid, h.name house
            FROM ledger l JOIN houses h ON h.id=l.house_id` },
  ]);
  const okHouse = (hid: number) => p.house === null || p.house === hid;
  const okMonth = (m: string) => (!p.from || m >= p.from) && (!p.to || m <= p.to);
  const okAmount = (a: number) => (p.min === null || a >= p.min) && (p.max === null || a <= p.max);
  const q = (s: unknown) => String(s ?? "");

  const hits: Hit[] = [];
  const push = (h: Hit) => hits.push(h);
  // Khi có lọc theo tháng / trạng thái / số tiền thì các loại không có trường đó (phòng, khách, xe...) không hiện, tránh kết quả nhiễu
  const strict = !!p.from || !!p.to || !!p.status || p.min !== null || p.max !== null;

  if (want("room") && !strict) for (const r of roomR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    if (!has([q(r.code), q(r.note), q(r.floor_label), q(r.kind), q(r.tenant), q(r.mnotes), q(r.house)], needles)) continue;
    push({ type: "room", id: Number(r.id), title: `Phòng ${q(r.code)}`, sub: [r.tenant ? `Khách: ${q(r.tenant)}` : "Phòng trống", r.rent ? vnd(Number(r.rent)) : "", q(r.note) || q(r.mnotes)].filter(Boolean).join(" · "), href: `/rooms/${r.id}`, house: q(r.house) });
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
  if (want("invoice")) for (const r of invR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid)) || !okMonth(q(r.month))) continue;
    const total = Number(r.total), paid = Number(r.paid);
    const st = statusOf(total, paid, q(r.due_date), q(r.state));
    if (p.status && st !== p.status) continue;
    if (!okAmount(total)) continue;
    // Gõ "10/2026" hoặc "2026-10" đều khớp tháng
    if (!has([q(r.tenant_name), `phong ${q(r.code)}`, q(r.house), q(r.month), monthLabel(q(r.month)), STATUS_LABEL[st], String(total)], needles)) continue;
    push({ type: "invoice", id: Number(r.id), title: `Hóa đơn ${monthLabel(q(r.month))} · Phòng ${q(r.code)}`, sub: `${q(r.tenant_name)} · ${vnd(total)} · đã thu ${vnd(paid)}`, href: `/invoices/${r.id}`, house: q(r.house), month: q(r.month), amount: total, status: st });
  }
  if (want("issue") && !p.status) for (const r of issR as Record<string, unknown>[]) {
    if (!okHouse(Number(r.hid))) continue;
    const month = q(r.created).slice(0, 7);
    if (!okMonth(month)) continue;
    const cost = Number(r.cost) || 0;
    if (!okAmount(cost) && (p.min !== null || p.max !== null)) continue;
    if (!has([q(r.title), q(r.detail), q(r.code), q(r.house), q(r.status)], needles)) continue;
    push({ type: "issue", id: Number(r.id), title: q(r.title), sub: `${r.code ? `Phòng ${q(r.code)}` : "Chung cả nhà"} · ${q(r.status) === "done" ? "đã xong" : q(r.status) === "open" ? "mới báo" : "đang xử lý"}${cost ? ` · chi ${vnd(cost)}` : ""}`, href: "/issues", house: q(r.house), month, amount: cost || undefined });
  }
  if (want("ledger") && !p.status) for (const r of ledR as Record<string, unknown>[]) {
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
