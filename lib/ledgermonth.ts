import { mergeSettings, readAll, type House } from "./db";
import { parsePartners, type Partner } from "./report";

export type ExpenseItem = { name: string; qty: number; unit: number };
export type NewRoomRow = { room: string; rent: number; people: number; phone: string; total: number; note: string };
export type LedgerMonth = {
  items: ExpenseItem[]; newRooms: NewRoomRow[];
  chi: { dien: number; nuoc: number; mang: number; dich_vu: number; tien_phong: number };
  rentMonthly: number; salaryMonthly: number; partners: Partner[];
};

const parse = <T,>(s: string): Partial<T> => { try { return JSON.parse(s) as Partial<T>; } catch { return {}; } };

/** Sổ thu chi của một nhà trong một tháng: chi phí phát sinh, thu phòng mới, chi theo từng khoản. */
export async function loadLedgerMonth(houseId: number, month: string): Promise<LedgerMonth> {
  const [lg, hr, kv] = await readAll([
    { sql: "SELECT kind, category, name, amount, meta FROM ledger WHERE house_id=? AND month=? ORDER BY id", args: [houseId, month] },
    { sql: "SELECT id, name, address FROM houses WHERE id=?", args: [houseId] },
    { sql: "SELECT key, value FROM house_settings WHERE house_id=?", args: [houseId] },
  ]);
  const rows = lg as { kind: string; category: string; name: string; amount: number; meta: string }[];
  const s = mergeSettings(hr[0] as House | undefined, kv as { key: string; value: string }[]);
  const sum = (c: string) => rows.filter((r) => r.kind === "chi" && r.category === c).reduce((a, r) => a + r.amount, 0);
  return {
    items: rows.filter((r) => r.kind === "chi" && ["phat_sinh", "luong", "dau_tu"].includes(r.category)).map((r) => {
      const m = parse<{ qty: number; unit: number }>(r.meta);
      return { name: r.name, qty: m.qty ?? 1, unit: m.unit ?? r.amount };
    }),
    newRooms: rows.filter((r) => r.kind === "thu" && r.category === "phong_moi").map((r) => {
      const m = parse<NewRoomRow>(r.meta);
      return { room: m.room ?? r.name, rent: m.rent ?? 0, people: m.people ?? 1, phone: m.phone ?? "", total: r.amount, note: m.note ?? "" };
    }),
    chi: { dien: sum("dien"), nuoc: sum("nuoc"), mang: sum("mang"), dich_vu: sum("dich_vu"), tien_phong: sum("tien_phong") },
    rentMonthly: Number(s.rent_cost_monthly) || 0, salaryMonthly: Number(s.manager_salary) || 0, partners: parsePartners(s.partners),
  };
}
