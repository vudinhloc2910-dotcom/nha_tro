import { all, getSettings } from "./db";
import { addMonths, type RoomInput, type SvcInput } from "./calc";
import { prevMonth } from "./format";

export type RoomView = {
  id: number; code: string; rent: number; dueDay: number; note: string;
  tenantId: number; tenantName: string; phone: string; tenantPeople: number;
  /** Giá riêng của phòng (null = dùng giá chung của nhà) */
  prefs: { elecPrice: number | null; waterPrice: number | null; svc: Record<number, { unit: number | null; off: boolean }> };
  input: RoomInput;
  /** Giá trị tự động (để hiện làm gợi ý khi chủ trọ chưa đặt tay) */
  auto: { debt: number; periodStart: string; periodEnd: string };
  invoice: { id: number; token: string; total: number; paid: number; locked: boolean; due: string } | null;
  prevUsage: { e: number; w: number } | null;
  hasReading: boolean;
};
export type MonthData = {
  houseId: number; month: string; settings: Record<string, string>;
  services: { id: number; name: string; type: "room" | "person"; price: number }[];
  rooms: RoomView[]; vacant: string[];
};

type KV = { room_id: number; key: string; value: string };

/** Đọc toàn bộ dữ liệu một tháng của một nhà (ít truy vấn nhất có thể) và dựng sẵn đầu vào tính tiền cho từng phòng. */
export async function loadMonth(houseId: number, month: string): Promise<MonthData> {
  const settings = await getSettings(houseId);
  const services = await all<{ id: number; name: string; type: "room" | "person"; price: number }>(
    "SELECT id, name, type, price FROM services WHERE house_id=? AND active=1 ORDER BY id", houseId
  );
  const rooms = await all<{ id: number; code: string; rent: number; due_day: number; note: string | null; tid: number | null; tname: string | null; phone: string | null; people: number | null }>(
    `SELECT r.id, r.code, r.rent, r.due_day, r.note, t.id tid, t.name tname, t.phone, t.people
     FROM rooms r LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1 WHERE r.house_id=? ORDER BY r.code`, houseId
  );
  const occupied = rooms.filter((r) => r.tid !== null);
  const vacant = rooms.filter((r) => r.tid === null).map((r) => r.code);
  const out: MonthData = { houseId, month, settings, services, rooms: [], vacant };
  if (occupied.length === 0) return out;

  const ids = occupied.map((r) => Number(r.id)).join(","); // id lấy từ database nên an toàn khi nối chuỗi
  const prefs = await all<KV>(`SELECT room_id, key, value FROM room_prefs WHERE room_id IN (${ids})`);
  const rm = await all<KV>(`SELECT room_id, key, value FROM room_month WHERE month=? AND room_id IN (${ids})`, month);
  const pm = prevMonth(month);
  const readings = await all<{ room_id: number; month: string; elec_old: number; elec_new: number; water_old: number; water_new: number }>(
    `SELECT room_id, month, elec_old, elec_new, water_old, water_new FROM readings WHERE month IN (?,?) AND room_id IN (${ids})`, month, pm
  );
  const extras = await all<{ room_id: number; name: string; amount: number }>(
    `SELECT room_id, name, amount FROM extras WHERE month=? AND room_id IN (${ids}) ORDER BY id`, month
  );
  const invoices = await all<{ id: number; room_id: number; token: string; total: number; due_date: string; period_start: string | null; locked: number; paid: number }>(
    `SELECT i.id, i.room_id, i.token, i.total, i.due_date, i.period_start, i.locked,
       COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
     FROM invoices i WHERE i.month=? AND i.room_id IN (${ids})`, month
  );
  const prevInv = await all<{ room_id: number; total: number; due_date: string; paid: number }>(
    `SELECT i.room_id, i.total, i.due_date, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
     FROM invoices i WHERE i.room_id IN (${ids}) AND i.month=(SELECT MAX(month) FROM invoices WHERE room_id=i.room_id AND month<?)`, month
  );

  const by = <T extends { room_id: number }>(list: T[], id: number) => list.filter((x) => x.room_id === id);
  const ePrice = Number(settings.elec_price) || 0, wPrice = Number(settings.water_price) || 0;
  const waterMode: "meter" | "person" = settings.water_mode === "person" ? "person" : "meter";
  const pad = (n: number) => String(n).padStart(2, "0");

  for (const r of occupied) {
    const pf = new Map(by(prefs, r.id).map((x) => [x.key, x.value]));
    const mo = new Map(by(rm, r.id).map((x) => [x.key, x.value]));
    const cur = readings.find((x) => x.room_id === r.id && x.month === month);
    const prev = readings.find((x) => x.room_id === r.id && x.month === pm);
    const inv = invoices.find((x) => x.room_id === r.id);
    const pi = prevInv.find((x) => x.room_id === r.id);
    const num = (v: string | undefined) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

    const svcPrefs: Record<number, { unit: number | null; off: boolean }> = {};
    const svcInputs: SvcInput[] = services.map((s) => {
      const unit = num(pf.get(`svc:${s.id}`));
      const off = pf.get(`svc_off:${s.id}`) === "1";
      svcPrefs[s.id] = { unit, off };
      return { id: s.id, name: s.name, type: s.type, unit: unit ?? s.price, off, amount: num(mo.get(`svc:${s.id}`)) };
    });

    const people = Math.max(1, Math.round(num(mo.get("people")) ?? r.people ?? 1));
    const debtAuto = pi ? Math.max(0, pi.total - pi.paid) : 0;
    // Kỳ thuê: tự nối tiếp từ hạn của kỳ trước; chưa có kỳ trước thì lấy ngày "hạn đóng" của phòng trong tháng này
    const autoStart = pi?.due_date ?? `${month}-${pad(Math.min(Math.max(r.due_day, 1), 28))}`;
    const autoEnd = addMonths(autoStart, 1);
    const periodEnd = mo.get("p_end") || inv?.due_date || autoEnd;
    const periodStart = mo.get("p_start") || inv?.period_start || (inv ? addMonths(periodEnd, -1) : autoStart);

    const input: RoomInput = {
      people, rent: Math.round(num(mo.get("rent")) ?? r.rent),
      elecOld: cur?.elec_old ?? prev?.elec_new ?? 0, elecNew: cur ? cur.elec_new : null,
      elecPrice: num(pf.get("elec_price")) ?? ePrice,
      waterMode, waterOld: cur?.water_old ?? prev?.water_new ?? 0, waterNew: cur ? cur.water_new : null,
      waterPrice: num(pf.get("water_price")) ?? wPrice,
      services: svcInputs,
      extras: by(extras, r.id).map((x) => ({ name: x.name, amount: x.amount })),
      discount: Math.abs(num(mo.get("discount")) ?? 0),
      debt: Math.round(num(mo.get("debt")) ?? debtAuto),
      periodStart, periodEnd,
    };
    out.rooms.push({
      id: r.id, code: r.code, rent: r.rent, dueDay: r.due_day, note: r.note ?? "",
      tenantId: Number(r.tid), tenantName: r.tname ?? "", phone: r.phone ?? "", tenantPeople: r.people ?? 1,
      prefs: { elecPrice: num(pf.get("elec_price")), waterPrice: num(pf.get("water_price")), svc: svcPrefs },
      input, auto: { debt: debtAuto, periodStart: autoStart, periodEnd: autoEnd },
      invoice: inv ? { id: inv.id, token: inv.token, total: inv.total, paid: inv.paid, locked: !!inv.locked, due: inv.due_date } : null,
      prevUsage: prev ? { e: Math.max(0, prev.elec_new - prev.elec_old), w: Math.max(0, prev.water_new - prev.water_old) } : null,
      hasReading: !!cur,
    });
  }
  return out;
}
