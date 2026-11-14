import { all } from "./db";
import { today } from "./format";

export type OverdueItem = { house: string; houseId: number; roomId: number; code: string; tenant: string; phone: string; amount: number; days: number; month: string; token: string };
export type ExpiringItem = { house: string; roomId: number; code: string; tenant: string; phone: string; end: string; daysLeft: number };
export type VacantItem = { house: string; roomId: number; code: string; rent: number; days: number | null };
export type ResidenceItem = { house: string; roomId: number; code: string; tenant: string; phone: string; moveIn: string; days: number };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Những việc cần xử lý của tất cả các nhà: nợ trễ hạn, hợp đồng sắp hết, phòng trống, khách chưa khai tạm trú. */
export async function loadAlerts() {
  const t0 = today();
  const inv = await all<{ house: string; houseId: number; roomId: number; code: string; tenant: string | null; phone: string | null; total: number; paid: number; due: string; month: string; token: string }>(
    `SELECT h.name house, h.id houseId, r.id roomId, r.code, t.name tenant, t.phone, i.total, i.due_date due, i.month, i.token,
       COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
     FROM invoices i JOIN rooms r ON r.id=i.room_id JOIN houses h ON h.id=r.house_id
     LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1
     WHERE i.due_date < ?`, t0
  );
  const byRoom = new Map<number, OverdueItem>();
  for (const i of inv) {
    const remain = i.total - i.paid;
    if (remain <= 0 || !i.tenant) continue;
    const cur = byRoom.get(i.roomId);
    const days = daysBetween(i.due, t0);
    // Mỗi phòng gom nợ quá hạn; hiển thị tháng/link của hóa đơn quá hạn mới nhất
    if (!cur) byRoom.set(i.roomId, { house: i.house, houseId: i.houseId, roomId: i.roomId, code: i.code, tenant: i.tenant, phone: i.phone ?? "", amount: remain, days, month: i.month, token: i.token });
    else { cur.amount += remain; if (i.month > cur.month) { cur.month = i.month; cur.token = i.token; cur.days = days; } }
  }
  const overdue = [...byRoom.values()].sort((a, b) => b.days - a.days);

  const ten = await all<{ house: string; roomId: number; code: string; tenant: string; phone: string | null; end: string | null; move_in: string | null; residence: number }>(
    `SELECT h.name house, r.id roomId, r.code, t.name tenant, t.phone, t.contract_end end, t.move_in, t.residence_done residence
     FROM tenants t JOIN rooms r ON r.id=t.room_id JOIN houses h ON h.id=r.house_id WHERE t.active=1`
  );
  const expiring: ExpiringItem[] = ten
    .filter((x) => x.end && /^\d{4}-\d{2}-\d{2}$/.test(x.end) && daysBetween(t0, x.end) <= 30)
    .map((x) => ({ house: x.house, roomId: x.roomId, code: x.code, tenant: x.tenant, phone: x.phone ?? "", end: x.end!, daysLeft: daysBetween(t0, x.end!) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const residence: ResidenceItem[] = ten
    .filter((x) => !x.residence && x.move_in && /^\d{4}-\d{2}-\d{2}$/.test(x.move_in) && daysBetween(x.move_in, t0) >= 0 && daysBetween(x.move_in, t0) <= 30)
    .map((x) => ({ house: x.house, roomId: x.roomId, code: x.code, tenant: x.tenant, phone: x.phone ?? "", moveIn: x.move_in!, days: daysBetween(x.move_in!, t0) }));

  const vac = await all<{ house: string; roomId: number; code: string; rent: number; last_out: string | null }>(
    `SELECT h.name house, r.id roomId, r.code, r.rent,
       (SELECT MAX(x.move_out) FROM tenants x WHERE x.room_id=r.id AND x.active=0) last_out
     FROM rooms r JOIN houses h ON h.id=r.house_id
     WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.room_id=r.id AND t.active=1)`
  );
  const vacant: VacantItem[] = vac
    .map((v) => ({ house: v.house, roomId: v.roomId, code: v.code, rent: v.rent, days: v.last_out && /^\d{4}-\d{2}-\d{2}$/.test(v.last_out) ? Math.max(0, daysBetween(v.last_out, t0)) : null }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  return { overdue, expiring, residence, vacant };
}
