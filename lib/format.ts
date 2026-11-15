export const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
export const today = () => new Date().toISOString().slice(0, 10);
export const currentMonth = () => today().slice(0, 7);
export function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
}
export const monthLabel = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
export function dateVN(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
/** Số ngày khách được đóng tiền kể từ ngày đầu kỳ thu. */
export const PAY_WINDOW_DAYS = 5;
/** "Hạn đóng" ghi trên hóa đơn: từ ngày đầu kỳ thu đến ngày thứ +5 (VD kỳ 30/10 → "30/10 - 05/11/2026"). Không có ngày đầu kỳ thì chỉ hiện hạn cuối kỳ. */
export function payWindowText(periodStart: string | null | undefined, dueDate: string): string {
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return dateVN(dueDate);
  const end = new Date(Date.parse(periodStart) + PAY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const [, m1, d1] = periodStart.split("-");
  return `${d1}/${m1} - ${dateVN(end)}`;
}
export type Status = "paid" | "partial" | "unpaid" | "overdue";
/** Trạng thái hóa đơn. `state` là trạng thái chủ trọ đặt tay ("unpaid" = chưa thu, "overdue" = quá hạn); đã thu đủ thì luôn là "paid". */
export function statusOf(total: number, paid: number, due: string, state = ""): Status {
  if (paid >= total) return "paid";
  if (state === "overdue") return "overdue";
  if (state === "unpaid") return paid > 0 ? "partial" : "unpaid";
  if (due < today()) return "overdue";
  return paid > 0 ? "partial" : "unpaid";
}
export const STATUS_LABEL: Record<Status, string> = {
  paid: "Đã thu", partial: "Thu một phần", unpaid: "Chưa thu", overdue: "Quá hạn",
};
export const STATUS_CLASS: Record<Status, string> = {
  paid: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  unpaid: "bg-gray-100 text-gray-700",
  overdue: "bg-red-100 text-red-800",
};
