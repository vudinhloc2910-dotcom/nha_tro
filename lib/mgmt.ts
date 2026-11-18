import { listHouses, readAll } from "./db";
import { loadAlerts } from "./alerts";
import { addMonths } from "./calc";
import { houseReport, type MonthReport } from "./report";
import { prevMonth, today } from "./format";

export type HouseRow = {
  id: number; name: string; rooms: number; occupied: number;
  billed: number; paid: number; debt: number; overdue: number;
  cost: number; profit: number; kwh: number; m3: number; revenue: number;
  rep: MonthReport | null; prev: MonthReport | null;
};
export type MeterRow = { houseId: number; house: string; code: string; eOld: number; eNew: number; eUse: number; ePrev: number | null; wOld: number; wNew: number; wUse: number; wPrev: number | null };
export type CashRow = { month: string; inflow: number; other: number; outflow: number; net: number };
export type Mgmt = {
  month: string; houses: HouseRow[]; total: HouseRow;
  meters: MeterRow[];
  cash: { houseId: number | "all"; rows: CashRow[] };
  trend: { month: string; revenue: number; cost: number; profit: number }[];
  plan: {
    next: string; expRevenue: number; expCost: number; expProfit: number; fixedRent: number; salary: number;
    vacant: { house: string; code: string; rent: number }[]; vacantLoss: number;
    expiring: { house: string; code: string; tenant: string; end: string; daysLeft: number; rent: number }[];
    overdueTotal: number; overdueCount: number; missingReadings: { house: string; code: string }[]; openIssues: number;
    jumps: { house: string; code: string; now: number; prev: number }[];
  };
};

const sumBy = <T,>(a: T[], f: (x: T) => number) => a.reduce((t, x) => t + f(x), 0);

/** Gom số liệu quản trị của tất cả các nhà cho một tháng: tổng hợp, điện nước, lãi lỗ, dòng tiền 6 tháng, kế hoạch tháng sau. */
export async function loadMgmt(month: string, houseFilter: number | null): Promise<Mgmt> {
  const allHouses = await listHouses();
  const houses = houseFilter ? allHouses.filter((h) => h.id === houseFilter) : allHouses;
  const from = [1, 2, 3, 4, 5].reduce((m) => prevMonth(m), month);
  const pm = prevMonth(month);
  const ids = houses.map((h) => h.id);
  const idSet = new Set(ids);

  const [roomsR, readR, payR, tenR, vacR, issR, invR] = await readAll([
    { sql: `SELECT r.house_id, COUNT(*) rooms, SUM(CASE WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.room_id=r.id AND t.active=1) THEN 1 ELSE 0 END) occupied FROM rooms r GROUP BY r.house_id` },
    { sql: `SELECT r.house_id, h.name house, r.code, d.month, d.elec_old, d.elec_new, d.water_old, d.water_new
            FROM readings d JOIN rooms r ON r.id=d.room_id JOIN houses h ON h.id=r.house_id WHERE d.month IN (?,?)`, args: [month, pm] },
    { sql: `SELECT r.house_id, substr(p.paid_at,1,7) m, SUM(p.amount) amt
            FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN rooms r ON r.id=i.room_id
            WHERE substr(p.paid_at,1,7) BETWEEN ? AND ? GROUP BY r.house_id, substr(p.paid_at,1,7)`, args: [from, month] },
    { sql: `SELECT h.name house, r.house_id, r.code, t.name tenant, r.rent FROM rooms r JOIN houses h ON h.id=r.house_id
            LEFT JOIN tenants t ON t.room_id=r.id AND t.active=1` },
    { sql: `SELECT h.name house, r.house_id, r.code, r.rent FROM rooms r JOIN houses h ON h.id=r.house_id
            WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.room_id=r.id AND t.active=1)` },
    { sql: "SELECT house_id, COUNT(*) n FROM issues WHERE status<>'done' GROUP BY house_id" },
    { sql: `SELECT r.house_id, r.code, h.name house FROM invoices i JOIN rooms r ON r.id=i.room_id JOIN houses h ON h.id=r.house_id WHERE i.month=?`, args: [month] },
  ]);
  const roomsB = roomsR as { house_id: number; rooms: number; occupied: number }[];
  const reads = (readR as { house_id: number; house: string; code: string; month: string; elec_old: number; elec_new: number; water_old: number; water_new: number }[]).filter((r) => idSet.has(r.house_id));
  const pays = (payR as { house_id: number; m: string; amt: number }[]).filter((r) => idSet.has(r.house_id));
  const tenants = (tenR as { house: string; house_id: number; code: string; tenant: string | null; rent: number }[]).filter((r) => idSet.has(r.house_id));
  const vacants = (vacR as { house: string; house_id: number; code: string; rent: number }[]).filter((r) => idSet.has(r.house_id));
  const issues = (issR as { house_id: number; n: number }[]).filter((r) => idSet.has(r.house_id));
  const invoicedRooms = new Set((invR as { house_id: number; house: string; code: string }[]).filter((r) => idSet.has(r.house_id)).map((r) => `${r.house_id}|${r.code}`));

  const [reports, al] = await Promise.all([Promise.all(houses.map((h) => houseReport(h.id, from, month))), loadAlerts()]);
  const overdueByHouse = new Map<string, number>();
  for (const o of al.overdue) overdueByHouse.set(o.house, (overdueByHouse.get(o.house) ?? 0) + o.amount);

  const rows: HouseRow[] = houses.map((h, i) => {
    const rep = reports[i].months.find((m) => m.month === month) ?? null;
    const prev = reports[i].months.find((m) => m.month === pm) ?? null;
    const rb = roomsB.find((x) => x.house_id === h.id);
    const billed = rep?.billed ?? 0, paid = rep?.paid ?? 0;
    return {
      id: h.id, name: h.name, rooms: rb?.rooms ?? 0, occupied: rb?.occupied ?? 0, billed, paid, debt: billed - paid,
      overdue: overdueByHouse.get(h.name) ?? 0, cost: (rep?.total_cost ?? 0), profit: rep?.profit ?? 0,
      kwh: rep?.kwh ?? 0, m3: rep?.m3 ?? 0, revenue: rep?.revenue ?? 0, rep, prev,
    };
  });
  const total: HouseRow = {
    id: 0, name: "TỔNG CÁC NHÀ", rooms: sumBy(rows, (r) => r.rooms), occupied: sumBy(rows, (r) => r.occupied), billed: sumBy(rows, (r) => r.billed),
    paid: sumBy(rows, (r) => r.paid), debt: sumBy(rows, (r) => r.debt), overdue: sumBy(rows, (r) => r.overdue), cost: sumBy(rows, (r) => r.cost),
    profit: sumBy(rows, (r) => r.profit), kwh: sumBy(rows, (r) => r.kwh), m3: sumBy(rows, (r) => r.m3), revenue: sumBy(rows, (r) => r.revenue), rep: null, prev: null,
  };

  // Chỉ số điện nước từng phòng, so với tháng trước
  const prevMap = new Map(reads.filter((r) => r.month === pm).map((r) => [`${r.house_id}|${r.code}`, r]));
  const meters: MeterRow[] = reads.filter((r) => r.month === month).map((r) => {
    const p = prevMap.get(`${r.house_id}|${r.code}`);
    const e = Math.max(0, r.elec_new - r.elec_old), w = Math.max(0, r.water_new - r.water_old);
    return {
      houseId: r.house_id, house: r.house, code: r.code, eOld: r.elec_old, eNew: r.elec_new, eUse: e, ePrev: p ? Math.max(0, p.elec_new - p.elec_old) : null,
      wOld: r.water_old, wNew: r.water_new, wUse: w, wPrev: p ? Math.max(0, p.water_new - p.water_old) : null,
    };
  }).sort((a, b) => a.house.localeCompare(b.house, "vi") || a.code.localeCompare(b.code, "vi", { numeric: true }));

  // Xu hướng 6 tháng và dòng tiền thực (tiền vào theo ngày thu thật, tiền ra theo chi phí tháng)
  const months: string[] = [];
  { let m = from; for (let k = 0; k < 6; k++) { months.push(m); m = addMonths(`${m}-01`, 1).slice(0, 7); } }
  const trend = months.map((m) => {
    const ms = reports.map((r) => r.months.find((x) => x.month === m)).filter((x): x is MonthReport => !!x);
    return { month: m, revenue: sumBy(ms, (x) => x.revenue), cost: sumBy(ms, (x) => x.total_cost), profit: sumBy(ms, (x) => x.profit) };
  });
  const cashRows: CashRow[] = months.map((m) => {
    const ms = reports.map((r) => r.months.find((x) => x.month === m)).filter((x): x is MonthReport => !!x);
    const inflow = sumBy(pays.filter((p) => p.m === m), (p) => p.amt);
    const other = sumBy(ms, (x) => x.other_income);
    const outflow = sumBy(ms, (x) => x.total_cost + x.invest);
    return { month: m, inflow, other, outflow, net: inflow + other - outflow };
  });

  // Kế hoạch tháng sau: lấy trung bình 3 tháng gần nhất làm cơ sở, trừ phòng trống / sắp hết hợp đồng
  const next = addMonths(`${month}-01`, 1).slice(0, 7);
  const last3 = reports.flatMap((r) => r.months.filter((m) => m.month <= month).slice(-3));
  const nMonths = Math.max(1, new Set(last3.map((m) => m.month)).size);
  const avg = (f: (m: MonthReport) => number) => sumBy(last3, f) / nMonths;
  const expRevenue = Math.round(avg((m) => m.billed));
  const fixedRent = Math.round(sumBy(rows, (r) => r.rep?.chi.tien_phong ?? 0));
  const salary = Math.round(sumBy(rows, (r) => r.rep?.salary ?? 0));
  const expCost = Math.round(avg((m) => m.total_cost));
  const vacant = vacants.map((v) => ({ house: v.house, code: v.code, rent: v.rent }));
  const t0 = today();
  const expiring = al.expiring.filter((e) => houses.some((h) => h.name === e.house)).map((e) => {
    const rent = tenants.find((t) => t.house === e.house && t.code === e.code)?.rent ?? 0;
    return { house: e.house, code: e.code, tenant: e.tenant, end: e.end, daysLeft: e.daysLeft, rent };
  }).filter((e) => e.end >= t0 || e.daysLeft < 0);
  const missingReadings = tenants.filter((t) => t.tenant && !invoicedRooms.has(`${t.house_id}|${t.code}`)).map((t) => ({ house: t.house, code: t.code }));
  const jumps = meters.filter((m) => m.ePrev !== null && m.ePrev > 20 && m.eUse > m.ePrev * 1.5).map((m) => ({ house: m.house, code: m.code, now: m.eUse, prev: m.ePrev! }));
  const overdueList = al.overdue.filter((o) => houses.some((h) => h.name === o.house));

  return {
    month, houses: rows, total, meters, cash: { houseId: houseFilter ?? "all", rows: cashRows }, trend,
    plan: {
      next, expRevenue, expCost, expProfit: expRevenue - expCost, fixedRent, salary, vacant, vacantLoss: sumBy(vacant, (v) => v.rent),
      expiring, overdueTotal: sumBy(overdueList, (o) => o.amount), overdueCount: overdueList.length, missingReadings, openIssues: sumBy(issues, (i) => i.n), jumps,
    },
  };
}
