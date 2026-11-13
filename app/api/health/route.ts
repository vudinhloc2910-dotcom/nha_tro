import { getClient, pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const clean = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/eyJ[\w.-]+/g, "***").slice(0, 300);

/** Trang kiểm tra nhanh: cho biết đã đặt đủ biến môi trường chưa và có nối được database không. Không lộ giá trị bí mật. */
export async function GET(req: Request) {
  const env = {
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
  };
  const url = new URL(req.url);

  if (url.searchParams.get("diag") === "1") {
    // Thử từng thao tác riêng để biết chính xác thao tác nào bị Turso từ chối
    const steps: Record<string, string> = {};
    const c = await getClient();
    const run = async (name: string, f: () => Promise<unknown>) => {
      try { await f(); steps[name] = "ok"; } catch (e) { steps[name] = "loi: " + clean(e); }
    };
    await run("1_select", () => c.execute("SELECT 1"));
    await run("2_create_table", () => c.execute("CREATE TABLE IF NOT EXISTS _diag(a INTEGER)"));
    await run("3_execute_multiple", () => c.executeMultiple("CREATE TABLE IF NOT EXISTS _diag2(a INTEGER); CREATE TABLE IF NOT EXISTS _diag3(a INTEGER);"));
    await run("4_batch_write", () => c.batch([{ sql: "INSERT INTO _diag(a) VALUES (1)", args: [] }], "write"));
    await run("5_drop", () => c.executeMultiple("DROP TABLE IF EXISTS _diag; DROP TABLE IF EXISTS _diag2; DROP TABLE IF EXISTS _diag3;"));
    return Response.json({ env, steps });
  }

  let db = "ok";
  try {
    await pingDb();
  } catch (e) {
    db = "loi: " + clean(e);
  }
  return Response.json({ env, db }, { status: db === "ok" ? 200 : 500 });
}
