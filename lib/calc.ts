/**
 * Công thức tính hóa đơn MỘT phòng trong MỘT tháng.
 * Hàm thuần (không đụng database) để dùng chung ở máy chủ (khi lưu hóa đơn) và ở trình duyệt (hiện tổng tiền ngay khi gõ),
 * nhờ đó số trên màn hình luôn bằng số trong hóa đơn.
 */
import { vnd } from "./format";

export type WaterMode = "meter" | "person" | "room";
export const WATER_MODE_LABEL: Record<WaterMode, string> = { meter: "Theo chỉ số (m³)", person: "Theo người", room: "Theo phòng" };
export const WATER_UNIT: Record<WaterMode, string> = { meter: "m³", person: "người", room: "phòng" };
export const isWaterMode = (v: unknown): v is WaterMode => v === "meter" || v === "person" || v === "room";

export type SvcInput = {
  id: number; name: string; type: "room" | "person" | "vehicle";
  unit: number; // đơn giá đang áp dụng cho phòng này (giá riêng của phòng nếu có, không thì giá chung của nhà)
  off: boolean; // phòng này không thu dịch vụ này
  amount: number | null; // số tiền đặt tay cho riêng tháng này (null = tự tính)
};
export type RoomInput = {
  people: number; vehicles: number; rent: number;
  elecOld: number; elecNew: number | null; elecPrice: number;
  /** Đồng hồ điện phụ của phòng (null = không có): add = cộng thêm (VD nhà vệ sinh), sub = trừ đi (VD máy bơm). Cùng giá điện với đồng hồ chính. */
  aux?: { name: string; mode: "add" | "sub"; old: number; new: number | null } | null;
  /** Cách thu nước: meter = theo chỉ số (m³), person = theo người, room = cố định mỗi phòng */
  waterMode: WaterMode; waterOld: number; waterNew: number | null; waterPrice: number;
  services: SvcInput[];
  extras: { name: string; amount: number }[];
  discount: number; // giảm giá (số dương = giảm bớt)
  debt: number; // nợ cũ
  periodStart: string; periodEnd: string; // YYYY-MM-DD
};
export type Line = { label: string; detail: string; amount: number };

export const svcAuto = (s: SvcInput, people: number, vehicles = 0) => (s.type === "person" ? people * s.unit : s.type === "vehicle" ? vehicles * s.unit : s.unit);
export const svcAmount = (s: SvcInput, people: number, vehicles = 0) => (s.off ? 0 : s.amount ?? svcAuto(s, people, vehicles));
export const svcUnitLabel = (s: { type: "room" | "person" | "vehicle" }) => (s.type === "person" ? "/người" : s.type === "vehicle" ? "/xe" : "/phòng");

const dm = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export function computeInvoice(r: RoomInput): { lines: Line[]; total: number; elec: number; water: number } {
  const lines: Line[] = [];
  const period = r.periodStart && r.periodEnd ? `Kỳ ${dm(r.periodStart)} - ${dm(r.periodEnd)}` : "";
  lines.push({ label: "Tiền thuê phòng", detail: period, amount: r.rent });

  let elec = 0;
  if (r.elecNew !== null && r.elecNew !== r.elecOld) {
    const kwh = Math.max(0, r.elecNew - r.elecOld);
    elec = Math.round(kwh * r.elecPrice);
    lines.push({ label: "Tiền điện", detail: `${r.elecOld} → ${r.elecNew} = ${kwh} kWh × ${vnd(r.elecPrice)}`, amount: elec });
  }
  // Đồng hồ phụ: cộng thêm hoặc trừ vào tiền điện của phòng
  if (r.aux && r.aux.new !== null && r.aux.new !== r.aux.old) {
    const kwh = Math.max(0, r.aux.new - r.aux.old);
    const money = Math.round(kwh * r.elecPrice);
    const signed = r.aux.mode === "sub" ? -money : money;
    elec += signed;
    lines.push({ label: r.aux.mode === "sub" ? `Trừ ${r.aux.name.charAt(0).toLowerCase()}${r.aux.name.slice(1)}` : r.aux.name, detail: `${r.aux.old} → ${r.aux.new} = ${kwh} kWh × ${vnd(r.elecPrice)}`, amount: signed });
  }
  let water = 0;
  if (r.waterMode === "person") {
    water = r.people * r.waterPrice;
    lines.push({ label: "Tiền nước", detail: `${r.people} người × ${vnd(r.waterPrice)}`, amount: water });
  } else if (r.waterMode === "room") {
    water = r.waterPrice;
    lines.push({ label: "Tiền nước", detail: "Thu theo phòng", amount: water });
  } else if (r.waterNew !== null && r.waterNew !== r.waterOld) {
    const m3 = Math.max(0, r.waterNew - r.waterOld);
    water = Math.round(m3 * r.waterPrice);
    lines.push({ label: "Tiền nước", detail: `${r.waterOld} → ${r.waterNew} = ${m3} m³ × ${vnd(r.waterPrice)}`, amount: water });
  }
  for (const s of r.services) {
    if (s.off) continue;
    const amount = svcAmount(s, r.people, r.vehicles);
    if (s.amount === null && s.type === "person") lines.push({ label: s.name, detail: `${r.people} người × ${vnd(s.unit)}`, amount });
    else if (s.amount === null && s.type === "vehicle") lines.push({ label: s.name, detail: `${r.vehicles} xe × ${vnd(s.unit)}`, amount });
    else lines.push({ label: s.name, detail: "", amount });
  }
  for (const e of r.extras) lines.push({ label: e.name, detail: "Phụ phí phát sinh", amount: e.amount });
  // Giảm giá: số dương = giảm; số âm = tính thêm vào hóa đơn
  if (r.discount) lines.push({ label: r.discount > 0 ? "Giảm giá" : "Tính thêm", detail: "", amount: -r.discount });
  if (r.debt) lines.push({ label: "Nợ kỳ trước", detail: "", amount: r.debt });

  return { lines, total: lines.reduce((a, l) => a + l.amount, 0), elec, water };
}

/** Cộng n tháng vào ngày YYYY-MM-DD, giữ nguyên ngày (tháng ngắn hơn thì lấy ngày cuối tháng). */
export function addMonths(date: string, n: number): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1, d = Number(date.slice(8, 10));
  const t = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
