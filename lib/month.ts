import { cookies } from "next/headers";
import { currentMonth } from "./format";

export const MONTH_COOKIE = "nhatro_month";
const RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Tháng đang làm việc (lưu trong cookie, giữ nguyên khi chuyển trang hoặc sửa phòng). Chưa chọn thì lấy tháng hiện tại. */
export async function selectedMonth(): Promise<string> {
  const v = (await cookies()).get(MONTH_COOKIE)?.value ?? "";
  return RE.test(v) ? v : currentMonth();
}

export async function setSelectedMonth(m: string) {
  if (!RE.test(m)) return;
  (await cookies()).set(MONTH_COOKIE, m, { httpOnly: true, secure: !!process.env.VERCEL, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 3 });
}
