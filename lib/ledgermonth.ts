import { batchRows, mergeSettings, type House } from "./db";
import { currentMonth } from "./format";
import { parsePartners, type Partner } from "./report";

export type ExpenseItem = { name: string; qty: number; unit: number; note: string };
export type NewRoomRow = { room: string; rent: number; people: number; phone: string; total: number; note: string };
export type LedgerMonth = {
  items: ExpenseItem[]; newRooms: NewRoomRow[];
  chi: { dien: number; nuoc: number; mang: number; dich_vu: number; tien_phong: number };
  rentMonthly: number; salaryMonthly: number; partners: Partner[];
  /** Tên các khoản đã ghim (tự có ở các tháng sau) */
  pins: string[];
  /** Bảng thanh toán thực tế với chủ nhà (nhà ở chung với chủ): bật/tắt, phòng chủ nhà ở, có trừ chi phí phòng đó không */
  landlord: { enabled: boolean; elecRoomIds: number[]; waterRoomIds: number[]; extras: { name: string; amount: string }[]; name: string; token: string };
};

/** Các dòng chi phí phát sinh tự điền trong bảng thanh toán với chủ nhà (lưu theo tháng). */
function parseExtras(v: string | undefined): { name: string; amount: string }[] {
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? a.map((x) => ({ name: String(x?.name ?? ""), amount: String(x?.amount ?? "") })) : [];
  } catch { return []; }
}
const parseIds = (v: string | undefined) => (v ?? "").split(",").map(Number).filter((n) => n > 0);
const parse = <T,>(s: string): Partial<T> => { try { return JSON.parse(s) as Partial<T>; } catch { return {}; } };

/** Sổ thu chi của một nhà trong một tháng: chi phí phát sinh, thu phòng mới, chi theo từng khoản. */
export async function loadLedgerMonth(houseId: number, month: string): Promise<LedgerMonth> {
  // Khoản đã ghim tự có ở các tháng từ tháng ghim trở đi (chỉ áp dụng đến tháng sau của tháng hiện tại, và chỉ một lần cho mỗi tháng).
  // Ghi và đọc nằm chung MỘT lượt gọi database.
  const [y, m] = currentMonth().split("-").map(Number);
  const limit = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const apply = month <= limit;
  const writes = apply
    ? [
        {
          sql: `INSERT INTO ledger(house_id,month,kind,category,name,amount,source,meta)
                SELECT p.house_id, ?, 'chi', p.category, p.name, CAST(ROUND(p.qty*p.unit) AS INTEGER), 'pin', json_object('qty', p.qty, 'unit', p.unit, 'note', p.note)
                FROM pinned_expenses p
                WHERE p.house_id=? AND p.from_month<=?
                  AND NOT EXISTS (SELECT 1 FROM ledger_init i WHERE i.house_id=p.house_id AND i.month=?)
                  AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.house_id=p.house_id AND l.month=? AND l.kind='chi' AND l.name=p.name)`,
          args: [month, houseId, month, month, month],
        },
        {
          sql: "INSERT OR IGNORE INTO ledger_init(house_id, month) SELECT DISTINCT ?, ? FROM pinned_expenses WHERE house_id=? AND from_month<=?",
          args: [houseId, month, houseId, month],
        },
      ]
    : [];
  const res = await batchRows([
    ...writes,
    { sql: "SELECT kind, category, name, amount, meta FROM ledger WHERE house_id=? AND month=? ORDER BY id", args: [houseId, month] },
    { sql: "SELECT id, name, address FROM houses WHERE id=?", args: [houseId] },
    { sql: "SELECT key, value FROM house_settings WHERE house_id=?", args: [houseId] },
    { sql: "SELECT name FROM pinned_expenses WHERE house_id=?", args: [houseId] },
  ]);
  const [lg, hr, kv, pn] = res.slice(writes.length);
  const rows = lg as { kind: string; category: string; name: string; amount: number; meta: string }[];
  const s = mergeSettings(hr[0] as House | undefined, kv as { key: string; value: string }[]);
  const sum = (c: string) => rows.filter((r) => r.kind === "chi" && r.category === c).reduce((a, r) => a + r.amount, 0);
  return {
    items: rows.filter((r) => r.kind === "chi" && ["phat_sinh", "luong", "dau_tu"].includes(r.category)).map((r) => {
      const m = parse<{ qty: number; unit: number; note: string }>(r.meta);
      return { name: r.name, qty: m.qty ?? 1, unit: m.unit ?? r.amount, note: m.note ?? "" };
    }),
    newRooms: rows.filter((r) => r.kind === "thu" && r.category === "phong_moi").map((r) => {
      const m = parse<NewRoomRow>(r.meta);
      return { room: m.room ?? r.name, rent: m.rent ?? 0, people: m.people ?? 1, phone: m.phone ?? "", total: r.amount, note: m.note ?? "" };
    }),
    chi: { dien: sum("dien"), nuoc: sum("nuoc"), mang: sum("mang"), dich_vu: sum("dich_vu"), tien_phong: sum("tien_phong") },
    rentMonthly: Number(s.rent_cost_monthly) || 0, salaryMonthly: Number(s.manager_salary) || 0, partners: parsePartners(s.partners),
    pins: (pn as { name: string }[]).map((x) => x.name),
    landlord: { enabled: s.landlord_table === "1", elecRoomIds: parseIds(s.landlord_elec_room), waterRoomIds: parseIds(s.landlord_water_room), extras: parseExtras(s[`landlord_extra:${month}`]), name: s.landlord_name ?? "", token: s.landlord_bill_token ?? "" },
  };
}
