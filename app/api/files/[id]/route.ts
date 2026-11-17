import { isAdmin } from "@/lib/auth";
import { one } from "@/lib/db";

/** Xem/tải một file giấy tờ của phòng. Chỉ chủ trọ đã đăng nhập mới xem được (có ảnh CCCD nên không cho công khai). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await ctx.params;
  const f = await one<{ name: string; mime: string; data: string }>("SELECT name, mime, data FROM room_files WHERE id=?", Number(id));
  if (!f) return new Response("Không có file", { status: 404 });
  const buf = Buffer.from(f.data, "base64");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
