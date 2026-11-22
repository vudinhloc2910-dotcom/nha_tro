import { addMonths } from "./calc";

export type Contract = {
  id: number; room_id: number; tenant_id: number | null; start_date: string; end_date: string; handover_date: string;
  notice_days: number; rent: number; deposit: number; rent_from_start: number; status: string; note: string; created: string;
};
export type ContractEvent = {
  id: number; contract_id: number; kind: string; event_date: string; detail: string; old_end: string; new_end: string;
  rent_after: number | null; deposit_returned: number; deposit_deducted: number; created: string;
};
export type ScheduleRow = { no: number; start: string; end: string; amount: number };

export const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayMs = 86400000;
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * dayMs).toISOString().slice(0, 10);
export const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / dayMs);

export const KIND_LABEL: Record<string, string> = { renew: "Gia hạn", addendum: "Phụ lục", terminate: "Chấm dứt" };
export const STATUS_LABEL: Record<string, string> = { active: "Đang hiệu lực", terminated: "Đã chấm dứt" };

/** Ngày bắt đầu nhắc gia hạn: hạn hợp đồng trừ số ngày báo trước. */
export function noticeDate(c: Pick<Contract, "end_date" | "notice_days">): string | null {
  return isDate(c.end_date) ? addDays(c.end_date, -Math.max(0, c.notice_days)) : null;
}

/**
 * Lịch kỳ thu để xem (không tạo hóa đơn): mỗi tháng một kỳ, tính từ ngày bắt đầu đến hết hợp đồng.
 * Kỳ cuối bị cắt ở ngày kết thúc. Tiền mỗi kỳ = giá thuê của hợp đồng (kỳ lẻ ngày không tính theo tỉ lệ).
 */
export function schedule(c: Pick<Contract, "start_date" | "end_date" | "rent">): ScheduleRow[] {
  if (!isDate(c.start_date) || !isDate(c.end_date) || c.end_date < c.start_date) return [];
  const rows: ScheduleRow[] = [];
  for (let i = 0; i < 600; i++) {
    const start = addMonths(c.start_date, i);
    if (start > c.end_date) break;
    const next = addMonths(c.start_date, i + 1);
    const end = addDays(next, -1) > c.end_date ? c.end_date : addDays(next, -1);
    rows.push({ no: i + 1, start, end, amount: c.rent });
  }
  return rows;
}
