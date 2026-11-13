import { pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const clean = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/eyJ[\w.-]+/g, "***").slice(0, 300);

/** Trang kiểm tra nhanh: cho biết đã đặt đủ biến môi trường chưa và có nối được database không. Không lộ giá trị bí mật. */
export async function GET() {
  const env = {
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
  };
  let db = "ok";
  try {
    await pingDb();
  } catch (e) {
    db = "loi: " + clean(e);
  }
  return Response.json({ env, db }, { status: db === "ok" ? 200 : 500 });
}
