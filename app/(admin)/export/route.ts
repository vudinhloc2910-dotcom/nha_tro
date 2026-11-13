import { isAdmin } from "@/lib/auth";
import { allInvoices } from "@/lib/queries";

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const rows = await allInvoices();
  const head = ["Tháng", "Phòng", "Khách", "Tổng", "Đã thu", "Còn lại", "Hạn đóng", "Trạng thái"];
  const label = { paid: "Đã thu", partial: "Thu một phần", unpaid: "Chưa thu", overdue: "Quá hạn" } as const;
  const body = rows.map((r) =>
    [r.month, r.code, r.tenant_name, r.total, r.paid, Math.max(0, r.total - r.paid), r.due_date, label[r.status]].map(esc).join(",")
  );
  // BOM để Excel đọc đúng tiếng Việt
  const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="hoa-don.csv"',
    },
  });
}
