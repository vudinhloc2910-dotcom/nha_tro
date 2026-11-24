import { mergeSettings, readAll, type House } from "./db";
import { addMonths, isWaterMode, type RoomInput, type SvcInput, type WaterMode } from "./calc";
import { overdueDate, prevMonth } from "./format";
import { parseSharedMeters, sharedNew, sharedOld, sharedOldAuto } from "./shared-meters";

/** Một đồng hồ điện chung của nhà trong một tháng (để hiện ô nhập số ở bảng Hóa đơn tháng) */
export type SharedMeterView = { id: string; name: string; old: number; oldAuto: number; new: number | null; rooms: { roomId: number; code: string; parts: number }[] };

export type RoomView = {
  id: number; code: string; rent: number; dueDay: number; note: string;
  /** Ghi chú riêng của phòng trong tháng này */
  monthNote: string;
  tenantId: number; tenantName: string; phone: string; tenantPeople: number;
  /** Giá riêng của phòng (null = dùng giá chung của nhà) */
  prefs: {
    elecPrice: number | null; waterPrice: number | null; /** Cách thu nước riêng của phòng (null = theo cài đặt chung của nhà) */ waterMode: WaterMode | null; svc: Record<number, { unit: number | null; off: boolean }>;
    /** Đồng hồ điện phụ (null = phòng không có) */
    aux: { name: string; mode: "add" | "sub"; start: number } | null;
  };
  /** Số cũ tự động của đồng hồ phụ (số mới tháng trước, hoặc số đầu vào) */
  auxOldAuto: number;
  input: RoomInput;
  /** Giá trị tự động (để hiện làm gợi ý khi chủ trọ chưa đặt tay) */
  auto: { debt: number; periodStart: string; periodEnd: string };
  invoice: { id: number; token: string; total: number; paid: number; locked: boolean; due: string; state: string; lines: { label: string; detail: string; amount: number }[] } | null;
  prevUsage: { e: number; w: number } | null;
  hasReading: boolean;
  /** Số điện, nước đầu vào (số cũ của tháng đầu tiên khi phòng chưa có chỉ số) */
  start: { elec: number; water: number };
};
export type MonthData = {
  houseId: number; month: string; settings: Record<string, string>;
  services: { id: number; name: string; type: "room" | "person" | "vehicle"; price: number; roomId: number | null }[];
  rooms: RoomView[]; vacant: string[];
  sharedMeters: SharedMeterView[];
};

type KV = { room_id: number; key: string; value: string };

/** Đọc toàn bộ dữ liệu một tháng của một nhà (ít truy vấn nhất có thể) và dựng sẵn đầu vào tính tiền cho từng phòng. */
export async function loadMonth(houseId: number, month: string): Promise<MonthData> {
  const pm = prevMonth(month);
  // TẤT CẢ truy vấn đọc của tháng được gửi trong MỘT lượt gọi database (nhanh hơn nhiều so với gọi lần lượt)
  const [h, kv, svc, roomRows, prefs0, rm0, readings, extras, invoices, invLines0, prevInv, vehR, pmAux0] = await readAll([
    { sql: "SELECT id, name, address FROM houses WHERE id=?", args: [houseId] },
    { sql: "SELECT key, value FROM house_settings WHERE house_id=?", args: [houseId] },
    { sql: "SELECT id, name, type, price, room_id roomId FROM services WHERE house_id=? AND active=1 ORDER BY id", args: [houseId] },
    { sql: `SELECT r.id, r.code, r.rent, r.due_day, r.note, r.elec_start, r.water_start, t.id tid, t.name tname, t.phone, t.people
            FROM rooms r LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1 WHERE r.house_id=? ORDER BY r.code`, args: [houseId] },
    { sql: "SELECT p.room_id, p.key, p.value FROM room_prefs p JOIN rooms r ON r.id=p.room_id WHERE r.house_id=?", args: [houseId] },
    { sql: "SELECT m.room_id, m.key, m.value FROM room_month m JOIN rooms r ON r.id=m.room_id WHERE m.month=? AND r.house_id=?", args: [month, houseId] },
    { sql: "SELECT d.room_id, d.month, d.elec_old, d.elec_new, d.water_old, d.water_new FROM readings d JOIN rooms r ON r.id=d.room_id WHERE d.month IN (?,?) AND r.house_id=?", args: [month, pm, houseId] },
    { sql: "SELECT e.room_id, e.name, e.amount FROM extras e JOIN rooms r ON r.id=e.room_id WHERE e.month=? AND r.house_id=? ORDER BY e.id", args: [month, houseId] },
    { sql: `SELECT i.id, i.room_id, i.token, i.total, i.due_date, i.period_start, i.locked, i.state,
              COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
            FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.month=? AND r.house_id=?`, args: [month, houseId] },
    { sql: `SELECT l.invoice_id, l.label, l.detail, l.amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id
            JOIN rooms r ON r.id=i.room_id WHERE i.month=? AND r.house_id=? ORDER BY l.id`, args: [month, houseId] },
    { sql: `SELECT i.room_id, i.total, i.due_date, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
            FROM invoices i JOIN rooms r ON r.id=i.room_id
            WHERE r.house_id=? AND i.month=(SELECT MAX(month) FROM invoices WHERE room_id=i.room_id AND month<?)`, args: [houseId, month] },
    { sql: "SELECT v.room_id, COUNT(*) c FROM vehicles v JOIN rooms r ON r.id=v.room_id WHERE r.house_id=? GROUP BY v.room_id", args: [houseId] },
    { sql: "SELECT m.room_id, m.key, m.value FROM room_month m JOIN rooms r ON r.id=m.room_id WHERE m.month=? AND m.key='aux_new' AND r.house_id=?", args: [pm, houseId] },
  ]);
  const settings = mergeSettings(h[0] as House | undefined, kv as { key: string; value: string }[]);
  const services = svc as { id: number; name: string; type: "room" | "person" | "vehicle"; price: number; roomId: number | null }[];
  const vehCount = new Map((vehR as { room_id: number; c: number }[]).map((x) => [Number(x.room_id), Number(x.c)]));
  const rooms = roomRows as { id: number; code: string; rent: number; due_day: number; note: string | null; elec_start: number; water_start: number; tid: number | null; tname: string | null; phone: string | null; people: number | null }[];
  const occupied = rooms.filter((r) => r.tid !== null);
  const vacant = rooms.filter((r) => r.tid === null).map((r) => r.code);
  const sharedCfg = parseSharedMeters(settings.shared_meters);
  const codeOf = new Map(rooms.map((x) => [Number(x.id), x.code]));
  const sharedMeters: SharedMeterView[] = sharedCfg.map((m) => ({
    id: m.id, name: m.name, old: sharedOld(settings, m, month), oldAuto: sharedOldAuto(settings, m, month), new: sharedNew(settings, m.id, month),
    rooms: m.rooms.filter((x) => codeOf.has(x.roomId)).map((x) => ({ roomId: x.roomId, code: codeOf.get(x.roomId)!, parts: x.parts })),
  }));
  const out: MonthData = { houseId, month, settings, services, rooms: [], vacant, sharedMeters };
  if (occupied.length === 0) return out;

  const prefs = prefs0 as unknown as KV[];
  const rm = rm0 as unknown as KV[];
  const invLines = invLines0 as unknown as { invoice_id: number; label: string; detail: string; amount: number }[];
  type Rd = { room_id: number; month: string; elec_old: number; elec_new: number; water_old: number; water_new: number };
  const readingsT = readings as unknown as Rd[];
  const extrasT = extras as unknown as { room_id: number; name: string; amount: number }[];
  const invoicesT = invoices as unknown as { id: number; room_id: number; token: string; total: number; due_date: string; period_start: string | null; locked: number; state: string; paid: number }[];
  const prevInvT = prevInv as unknown as { room_id: number; total: number; due_date: string; paid: number }[];

  const by = <T extends { room_id: number }>(list: T[], id: number) => list.filter((x) => x.room_id === id);
  const ePrice = Number(settings.elec_price) || 0, wPrice = Number(settings.water_price) || 0;
  const houseWaterMode: WaterMode = settings.water_mode === "person" ? "person" : "meter";
  const pad = (n: number) => String(n).padStart(2, "0");

  for (const r of occupied) {
    const pf = new Map(by(prefs, r.id).map((x) => [x.key, x.value]));
    const mo = new Map(by(rm, r.id).map((x) => [x.key, x.value]));
    const cur = readingsT.find((x) => x.room_id === r.id && x.month === month);
    const prev = readingsT.find((x) => x.room_id === r.id && x.month === pm);
    const inv = invoicesT.find((x) => x.room_id === r.id);
    const pi = prevInvT.find((x) => x.room_id === r.id);
    const num = (v: string | undefined) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

    const svcPrefs: Record<number, { unit: number | null; off: boolean }> = {};
    const svcInputs: SvcInput[] = services.map((s) => {
      const unit = num(pf.get(`svc:${s.id}`));
      // Dịch vụ riêng của phòng khác thì phòng này không thu
      const off = (s.roomId !== null && s.roomId !== r.id) || pf.get(`svc_off:${s.id}`) === "1";
      svcPrefs[s.id] = { unit, off };
      return { id: s.id, name: s.name, type: s.type, unit: unit ?? s.price, off, amount: num(mo.get(`svc:${s.id}`)) };
    });

    const people = Math.max(1, Math.round(num(mo.get("people")) ?? r.people ?? 1));
    const debtAuto = pi ? Math.max(0, pi.total - pi.paid) : 0;
    // Kỳ thuê: tự nối tiếp từ hạn của kỳ trước; chưa có kỳ trước thì lấy ngày "hạn đóng" của phòng trong tháng này
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const autoStart = pi?.due_date ?? `${month}-${pad(Math.min(Math.max(r.due_day, 1), lastDay))}`;
    const autoEnd = addMonths(autoStart, 1);
    const periodEnd = mo.get("p_end") || inv?.due_date || autoEnd;
    const periodStart = mo.get("p_start") || inv?.period_start || (inv ? addMonths(periodEnd, -1) : autoStart);

    // Đồng hồ điện phụ (nhà vệ sinh cộng thêm, máy bơm trừ đi...): bật bằng room_prefs aux_on; số liệu tháng lưu ở room_month aux_old/aux_new
    const auxPref = pf.get("aux_on") === "1"
      ? { name: (pf.get("aux_name") || "Điện đồng hồ phụ").slice(0, 60), mode: (pf.get("aux_mode") === "sub" ? "sub" : "add") as "add" | "sub", start: num(pf.get("aux_start")) ?? 0 }
      : null;
    const prevAuxNew = num(by(pmAux0 as unknown as KV[], r.id)[0]?.value);
    const auxOldAuto = prevAuxNew ?? auxPref?.start ?? 0;

    const roomWaterMode = isWaterMode(pf.get("water_mode")) ? (pf.get("water_mode") as WaterMode) : null;
    const waterMode: WaterMode = roomWaterMode ?? houseWaterMode;
    const input: RoomInput = {
      people, vehicles: vehCount.get(r.id) ?? 0, rent: Math.round(num(mo.get("rent")) ?? r.rent),
      elecOld: cur?.elec_old ?? prev?.elec_new ?? r.elec_start ?? 0, elecNew: cur ? cur.elec_new : null,
      elecPrice: num(pf.get("elec_price")) ?? ePrice,
      aux: auxPref ? { name: auxPref.name, mode: auxPref.mode, old: num(mo.get("aux_old")) ?? auxOldAuto, new: num(mo.get("aux_new")) } : null,
      shared: sharedMeters.flatMap((m) => {
        const mine = m.rooms.find((x) => x.roomId === r.id);
        return mine ? [{ name: m.name, old: m.old, new: m.new, parts: mine.parts, total: m.rooms.reduce((a, x) => a + x.parts, 0) }] : [];
      }),
      waterMode, waterOld: cur?.water_old ?? prev?.water_new ?? r.water_start ?? 0, waterNew: cur ? cur.water_new : null,
      waterPrice: num(pf.get("water_price")) ?? wPrice,
      services: svcInputs,
      extras: by(extrasT, r.id).map((x) => ({ name: x.name, amount: x.amount })),
      discount: num(mo.get("discount")) ?? 0,
      debt: Math.round(num(mo.get("debt")) ?? debtAuto),
      periodStart, periodEnd,
    };
    out.rooms.push({
      id: r.id, code: r.code, rent: r.rent, dueDay: r.due_day, note: r.note ?? "", monthNote: mo.get("note") ?? "",
      tenantId: Number(r.tid), tenantName: r.tname ?? "", phone: r.phone ?? "", tenantPeople: r.people ?? 1,
      prefs: { elecPrice: num(pf.get("elec_price")), waterPrice: num(pf.get("water_price")), waterMode: roomWaterMode, svc: svcPrefs, aux: auxPref },
      auxOldAuto,
      input, auto: { debt: debtAuto, periodStart: autoStart, periodEnd: autoEnd },
      invoice: inv ? { id: inv.id, token: inv.token, total: inv.total, paid: inv.paid, locked: !!inv.locked, due: overdueDate(inv.period_start, inv.due_date), state: inv.state ?? "", lines: invLines.filter((l) => l.invoice_id === inv.id).map((l) => ({ label: l.label, detail: l.detail, amount: l.amount })) } : null,
      prevUsage: prev ? { e: Math.max(0, prev.elec_new - prev.elec_old), w: Math.max(0, prev.water_new - prev.water_old) } : null,
      hasReading: !!cur, start: { elec: r.elec_start ?? 0, water: r.water_start ?? 0 },
    });
  }
  return out;
}
