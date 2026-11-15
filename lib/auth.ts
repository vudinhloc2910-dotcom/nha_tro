import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, run } from "./db";

const COOKIE = "nhatro_admin";

/**
 * Mật khẩu: nếu chủ trọ đã đổi trong web thì dùng mật khẩu đã lưu trong database (băm scrypt, kèm "phiên bản").
 * Chưa đổi thì dùng ADMIN_PASSWORD trong cài đặt máy chủ. Đổi mật khẩu thì phiên bản đổi theo, các máy đang đăng nhập bị đăng xuất.
 */
const creds = cache(async () => {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key IN ('admin_pw','admin_pw_v')");
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return { hash: m.get("admin_pw") ?? "", ver: m.get("admin_pw_v") ?? "0" };
});

function token(ver: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu AUTH_SECRET trong .env.local");
  return crypto.createHmac("sha256", secret).update(`admin:${ver}`).digest("hex");
}

export async function checkPassword(input: string): Promise<boolean> {
  const { hash } = await creds();
  if (hash.startsWith("scrypt$")) {
    const [, salt, h] = hash.split("$");
    const a = crypto.scryptSync(input, Buffer.from(salt, "hex"), 64);
    const b = Buffer.from(h, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Đặt mật khẩu mới (lưu băm, không lưu mật khẩu gốc) và đổi phiên bản để đăng xuất các máy khác. */
export async function setPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = `scrypt$${salt.toString("hex")}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
  const ver = crypto.randomBytes(6).toString("hex");
  for (const [k, v] of [["admin_pw", hash], ["admin_pw_v", ver]]) {
    await run("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, v);
  }
  return ver;
}

export async function setSession(ver?: string) {
  const v = ver ?? (await creds()).ver;
  (await cookies()).set(COOKIE, token(v), { httpOnly: true, secure: !!process.env.VERCEL, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const a = Buffer.from(v), b = Buffer.from(token((await creds()).ver));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/login");
}
