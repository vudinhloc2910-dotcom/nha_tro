import { one } from "./db";
import { computeInvoice } from "./calc";
import { loadMonth, type RoomView } from "./monthdata";

export type BillRoom = { code: string; amount: number };
export type LandlordBill = {
  houseName: string; houseAddress: string; housePhone: string; landlordName: string; month: string;
  rent: number; elec: BillRoom[]; water: BillRoom[]; extras: { name: string; amount: number }[];
  elecTotal: number; waterTotal: number; extraTotal: number; pay: number;
};

const ids = (v?: string) => (v ?? "").split(",").map(Number).filter((n) => n > 0);

/** Tính bảng thanh toán tiền nhà với chủ nhà cho một tháng: thuê nhà − điện − nước (các phòng đã chọn) − phát sinh tự điền. Chỉ đọc, không ghi. */
export async function loadLandlordBill(houseId: number, month: string): Promise<LandlordBill> {
  const md = await loadMonth(houseId, month);
  const s = md.settings;
  const take = (r: RoomView, label: string) => {
    const ls = r.invoice?.lines?.length ? r.invoice.lines : computeInvoice(r.input).lines;
    return ls.filter((l) => l.label === label).reduce((a, l) => a + l.amount, 0);
  };
  const eIds = ids(s.landlord_elec_room), wIds = ids(s.landlord_water_room);
  const elec = md.rooms.filter((r) => eIds.includes(r.id)).map((r) => ({ code: r.code, amount: take(r, "Tiền điện") }));
  const water = md.rooms.filter((r) => wIds.includes(r.id)).map((r) => ({ code: r.code, amount: take(r, "Tiền nước") }));
  let rent = Number(s.rent_cost_monthly) || 0;
  if (!rent) rent = Number((await one<{ a: number }>("SELECT COALESCE(SUM(amount),0) a FROM ledger WHERE house_id=? AND month=? AND kind='chi' AND category='tien_phong'", houseId, month))?.a ?? 0);
  let extras: { name: string; amount: number }[] = [];
  try {
    const a = JSON.parse(s[`landlord_extra:${month}`] ?? "[]");
    if (Array.isArray(a)) extras = a.map((x) => ({ name: String(x?.name ?? "").trim() || "Khoản khác", amount: Math.round(Number(x?.amount) || 0) })).filter((x) => x.amount !== 0);
  } catch { /* bỏ qua */ }
  const sum = (a: { amount: number }[]) => a.reduce((t, x) => t + x.amount, 0);
  const elecTotal = sum(elec), waterTotal = sum(water), extraTotal = sum(extras);
  return {
    houseName: s.house_name ?? "", houseAddress: s.house_address ?? "", housePhone: s.house_phone ?? "", landlordName: s.landlord_name ?? "", month,
    rent, elec, water, extras, elecTotal, waterTotal, extraTotal, pay: rent - elecTotal - waterTotal - extraTotal,
  };
}
