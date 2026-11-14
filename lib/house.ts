import { cookies } from "next/headers";
import { listHouses, type House } from "./db";

export const HOUSE_COOKIE = "nhatro_house";

/** Nhà đang chọn (lưu trong cookie). Cookie sai hoặc chưa có thì lấy nhà đầu tiên. */
export async function currentHouse(): Promise<House> {
  const houses = await listHouses();
  const id = Number((await cookies()).get(HOUSE_COOKIE)?.value);
  return houses.find((h) => h.id === id) ?? houses[0];
}

export async function setCurrentHouse(id: number) {
  (await cookies()).set(HOUSE_COOKIE, String(id), { httpOnly: true, secure: !!process.env.VERCEL, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
