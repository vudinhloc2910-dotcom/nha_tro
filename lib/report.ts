import { mergeSettings, readAll, type House } from "./db";

export type Partner = { name: string; pct: number };
export type MonthReport = {
  month: string;
  billed: number; paid: number; other_income: number; revenue: number;
  chi: { dien: number; nuoc: number; mang: number; dich_vu: number; tien_phong: number; phat_sinh: number };
  salary: number; invest: number;
  total_cost: number; profit: number;
  items: { name: string; category: string; amount: number }[];
  kwh: number; m3: number; rooms: number;
};

/** "Tài:50, Lộc:50" -> [{name:"Tài",pct:50},{name:"Lộc",pct:50}] */
export function parsePartners(s: string | undefined): Partner[] {
  return (s ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [n, p] = x.split(":");
    return { name: (n ?? "").trim(), pct: Number(String(p ?? "").replace(/[^\d.]/g, "")) || 0 };
  }).filter((p) => p.name && p.pct > 0);
}

/**
 * Báo cáo thu chi từng tháng của một nhà.
 * - Doanh thu = tổng hóa đơn tháng + thu ngoài hóa đơn (phòng mới).
 * - Tiền thuê nhà trả chủ: nếu nhà cài "quy ra mỗi tháng" thì dùng số đó (chia đều theo tháng), không thì lấy theo sổ.
 * - Lương quản lý: lấy theo sổ; tháng chưa có trong sổ thì lấy mức cài đặt.
 * - Vốn đầu tư không tính vào lãi lỗ hằng tháng mà tính riêng (để biết bao giờ hòa vốn).
 */
export async function houseReport(houseId: number, fromMonth: string, toMonth: string): Promise<{ months: MonthReport[]; partners: Partner[]; settings: Record<string, string> }> {
  const [h, kv, invR, ledR, useR] = await readAll([
    { sql: "SELECT id, name, address FROM houses WHERE id=?", args: [houseId] },
    { sql: "SELECT key,value FROM house_settings WHERE house_id=?", args: [houseId] },
    { sql: `SELECT i.month, SUM(i.total) billed, SUM(MIN(i.total, COALESCE(p.paid,0))) paid, COUNT(*) rooms
            FROM invoices i JOIN rooms r ON r.id=i.room_id
            LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id=i.id
            WHERE r.house_id=? AND i.month BETWEEN ? AND ? GROUP BY i.month`, args: [houseId, fromMonth, toMonth] },
    { sql: "SELECT month, kind, category, name, amount FROM ledger WHERE house_id=? AND month BETWEEN ? AND ? ORDER BY id", args: [houseId, fromMonth, toMonth] },
    { sql: `SELECT d.month, SUM(MAX(d.elec_new-d.elec_old,0)) kwh, SUM(MAX(d.water_new-d.water_old,0)) m3
            FROM readings d JOIN rooms r ON r.id=d.room_id WHERE r.house_id=? AND d.month BETWEEN ? AND ? GROUP BY d.month`, args: [houseId, fromMonth, toMonth] },
  ]);
  const s = mergeSettings(h[0] as House | undefined, kv as { key: string; value: string }[]);
  const rentMonthly = Number(s.rent_cost_monthly) || 0;
  const salaryMonthly = Number(s.manager_salary) || 0;
  const inv = invR as { month: string; billed: number; paid: number; rooms: number }[];
  const led = ledR as { month: string; kind: string; category: string; name: string; amount: number }[];
  const use = useR as { month: string; kwh: number; m3: number }[];
  const months = new Set<string>([...inv.map((x) => x.month), ...led.map((x) => x.month)]);
  const out: MonthReport[] = [];
  for (const month of [...months].sort()) {
    const iv = inv.find((x) => x.month === month);
    const us = use.find((x) => x.month === month);
    const rows = led.filter((x) => x.month === month);
    const sum = (cat: string, kind = "chi") => rows.filter((x) => x.category === cat && x.kind === kind).reduce((a, x) => a + x.amount, 0);
    const chi = {
      dien: sum("dien"), nuoc: sum("nuoc"), mang: sum("mang"), dich_vu: sum("dich_vu"),
      tien_phong: rentMonthly > 0 ? rentMonthly : sum("tien_phong"), phat_sinh: sum("phat_sinh"),
    };
    const ledgerSalary = sum("luong");
    const salary = ledgerSalary || (iv ? salaryMonthly : 0);
    const invest = sum("dau_tu");
    const other_income = sum("phong_moi", "thu");
    const revenue = (iv?.billed ?? 0) + other_income;
    const total_cost = chi.dien + chi.nuoc + chi.mang + chi.dich_vu + chi.tien_phong + chi.phat_sinh + salary;
    out.push({
      month, billed: iv?.billed ?? 0, paid: iv?.paid ?? 0, other_income, revenue, chi, salary, invest, total_cost,
      profit: revenue - total_cost,
      items: rows.filter((x) => x.kind === "chi" && (x.category === "phat_sinh" || x.category === "dau_tu" || x.category === "luong")).map((x) => ({ name: x.name, category: x.category, amount: x.amount })),
      kwh: us?.kwh ?? 0, m3: us?.m3 ?? 0, rooms: iv?.rooms ?? 0,
    });
  }
  return { months: out, partners: parsePartners(s.partners), settings: s };
}
