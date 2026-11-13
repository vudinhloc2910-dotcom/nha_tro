import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "nhatro_admin";

function token() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu AUTH_SECRET trong .env.local");
  return crypto.createHmac("sha256", secret).update("admin").digest("hex");
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function setSession() {
  (await cookies()).set(COOKIE, token(), { httpOnly: true, secure: !!process.env.VERCEL, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const a = Buffer.from(v), b = Buffer.from(token());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/login");
}
