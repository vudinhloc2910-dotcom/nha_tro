import { isAdmin } from "@/lib/auth";
import { all } from "@/lib/db";
import { currentHouse } from "@/lib/house";

const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Tải danh sách người ở của nhà đang chọn (CSV mở được bằng Excel). */
export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const house = await currentHouse();
  const rows = await all<{ room_code: string; name: string; cccd: string; gender: string; dob: string; phone: string; job: string; address: string; plate: string; vehicle: string; emergency: string }>(
    "SELECT room_code, name, cccd, gender, dob, phone, job, address, plate, vehicle, emergency FROM residents WHERE house_id=? ORDER BY sort, id", house.id
  );
  const head = ["STT", "Phòng", "Tên", "CCCD", "Nam", "Nữ", "Ngày/tháng/năm", "Số điện thoại", "Nghề nghiệp", "Hộ khẩu thường trú", "BKS xe", "Loại xe, màu", "Liên hệ khẩn cấp"];
  const body = rows.map((r, i) =>
    [i + 1, r.room_code, r.name, r.cccd ? `'${r.cccd}` : "", r.gender === "Nam" ? "x" : "", r.gender === "Nữ" ? "x" : "", r.dob, r.phone ? `'${r.phone}` : "", r.job, r.address, r.plate, r.vehicle, r.emergency].map(esc).join(",")
  );
  const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nguoi-o-${house.name.replace(/[^\w]+/g, "-")}.csv"`,
    },
  });
}
