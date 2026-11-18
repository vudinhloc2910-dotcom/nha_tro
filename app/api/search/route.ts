import { isAdmin } from "@/lib/auth";
import { parseParams, runSearch } from "@/lib/search";

/** Tìm nhanh cho ô tìm kiếm ở thanh trên: tối đa 5 kết quả mỗi loại. Chỉ chủ trọ đã đăng nhập mới dùng được. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const p = parseParams({ q: sp.q });
  if (p.q.length < 1) return Response.json({ groups: [], total: 0 });
  const r = await runSearch(p, 5);
  return Response.json(r);
}
