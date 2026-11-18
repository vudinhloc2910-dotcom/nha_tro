import { requireAdmin } from "@/lib/auth";
import { parseParams, runSearch, TYPE_LABEL } from "@/lib/search";

/** Xuất kết quả tìm nâng cao ra file CSV (mở được bằng Excel). */
export async function GET(req: Request) {
  await requireAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const r = await runSearch(parseParams(sp), 5000);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Loại", "Nhà", "Tiêu đề", "Chi tiết", "Tháng", "Số tiền"].map(esc).join(",")];
  for (const g of r.groups) for (const h of g.hits) rows.push([TYPE_LABEL[h.type], h.house, h.title, h.sub, h.month ?? "", h.amount ?? ""].map(esc).join(","));
  return new Response("\uFEFF" + rows.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tim-kiem.csv"' } });
}
