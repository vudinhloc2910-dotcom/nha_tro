import { all } from "./db";
import { today } from "./format";

export type RoomStatus = "ok" | "vacant" | "debt" | "overdue";
export type RoomTile = {
  id: number; code: string; floor: number; floorLabel: string; kind: string;
  tenant: string | null; phone: string; people: number | null; rent: number;
  status: RoomStatus; debt: number; vacantDays: number | null;
};

/** Thứ tự hiển thị của một tầng/khu theo tên: hầm, trệt, lửng, tầng 1, 2, 3..., rồi các khu khác, cuối cùng là "Khác". */
export function floorOrder(label: string): number {
  const l = label.trim().toLowerCase();
  const m = l.match(/^t[aầ]ng\s*(\d+)/);
  if (m) return Number(m[1]);
  if (/h[aầ]m/.test(l)) return -1;
  if (/tr[eệ]t/.test(l)) return 0;
  if (/l[uử]ng/.test(l)) return 0.5;
  if (l === "khác") return 999;
  return 500;
}

/** Tầng của phòng theo số phòng: 201 -> tầng 2, 1205 -> tầng 12, B01 -> tầng hầm. Không đoán được thì xếp vào "Khác". */
export function floorOf(code: string): { n: number; label: string } {
  const c = code.trim();
  if (/^b\d*/i.test(c)) return { n: -1, label: "Tầng hầm" };
  const m = c.match(/^(\d+?)(\d{2})$/);
  if (m) return { n: Number(m[1]), label: `Tầng ${Number(m[1])}` };
  return { n: 999, label: "Khác" };
}

/** Danh sách phòng của một nhà kèm trạng thái: đang thuê, trống, nợ tiền, quá hạn. */
export async function roomTiles(houseId: number): Promise<RoomTile[]> {
  const rooms = await all<{ id: number; code: string; rent: number; floor_label: string; kind: string; tname: string | null; phone: string | null; people: number | null; last_out: string | null }>(
    `SELECT r.id, r.code, r.rent, r.floor_label, r.kind, t.name tname, t.phone, t.people,
       (SELECT MAX(x.move_out) FROM tenants x WHERE x.room_id=r.id AND x.active=0) last_out
     FROM rooms r LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1 WHERE r.house_id=? ORDER BY r.code`, houseId
  );
  const inv = await all<{ room_id: number; total: number; due_date: string; paid: number }>(
    `SELECT i.room_id, i.total, i.due_date, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) paid
     FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE r.house_id=?`, houseId
  );
  const t0 = today();
  const out: RoomTile[] = rooms.map((r) => {
    const mine = inv.filter((i) => i.room_id === r.id && i.total - i.paid > 0);
    const debt = mine.reduce((a, i) => a + (i.total - i.paid), 0);
    const late = mine.some((i) => i.due_date < t0);
    const f = r.floor_label ? { n: floorOrder(r.floor_label), label: r.floor_label } : floorOf(r.code);
    const vacant = r.tname === null;
    let vacantDays: number | null = null;
    if (vacant && r.last_out && /^\d{4}-\d{2}-\d{2}$/.test(r.last_out)) {
      vacantDays = Math.max(0, Math.round((Date.parse(t0) - Date.parse(r.last_out)) / 86400000));
    }
    return {
      id: r.id, code: r.code, floor: f.n, floorLabel: f.label, kind: r.kind, tenant: r.tname, phone: r.phone ?? "", people: r.people, rent: r.rent,
      status: vacant ? "vacant" : debt > 0 ? (late ? "overdue" : "debt") : "ok", debt: vacant ? 0 : debt, vacantDays,
    };
  });
  // Số phòng sắp xếp tự nhiên (2, 10 sau 9...)
  return out.sort((a, b) => a.floor - b.floor || a.code.localeCompare(b.code, "vi", { numeric: true }));
}
