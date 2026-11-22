"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { batch, one, run } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { isDate } from "@/lib/contracts";
import { today } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = Number(String(f.get(k) ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const dateOr = (f: FormData, k: string) => (isDate(str(f, k)) ? str(f, k) : "");

function back(roomId: number, params: Record<string, string>): never {
  revalidatePath("/", "layout");
  redirect(`/rooms/${roomId}?${new URLSearchParams({ tab: "contract", ...params }).toString()}`);
}

type C = { id: number; room_id: number; tenant_id: number | null; end_date: string; status: string };
async function loadContract(f: FormData): Promise<{ c: C; house_id: number; code: string }> {
  const id = num(f, "id");
  const c = await one<C>("SELECT id, room_id, tenant_id, end_date, status FROM contracts WHERE id=?", id);
  if (!c) redirect("/rooms");
  const r = await one<{ house_id: number; code: string }>("SELECT house_id, code FROM rooms WHERE id=?", c.room_id);
  if (!r) redirect("/rooms");
  return { c, house_id: r.house_id, code: r.code };
}

/** Giữ ô "Hợp đồng đến ngày" và tiền cọc của khách khớp với hợp đồng (trang Khách thuê và nhắc hết hạn đọc từ đó). */
async function syncTenant(c: C, end: string, deposit?: number) {
  if (!c.tenant_id) return;
  if (deposit === undefined) await run("UPDATE tenants SET contract_end=? WHERE id=?", end, c.tenant_id);
  else await run("UPDATE tenants SET contract_end=?, deposit=? WHERE id=?", end, deposit, c.tenant_id);
}

/** Tạo hợp đồng mới cho khách đang ở, hoặc sửa điều khoản hợp đồng đang hiệu lực. */
export async function saveContract(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const room = await one<{ house_id: number; code: string }>("SELECT house_id, code FROM rooms WHERE id=?", roomId);
  if (!room) redirect("/rooms");
  const start = dateOr(f, "start_date"), end = dateOr(f, "end_date"), handover = dateOr(f, "handover_date");
  if (!start || !end) back(roomId, { err: "Nhập ngày bắt đầu và ngày kết thúc hợp đồng" });
  if (end < start) back(roomId, { err: "Ngày kết thúc phải sau ngày bắt đầu" });
  const notice = Math.min(365, Math.max(0, Math.round(num(f, "notice_days")) || 30));
  const rent = Math.max(0, num(f, "rent")), deposit = Math.max(0, num(f, "deposit"));
  const fromStart = f.get("rent_from_start") ? 1 : 0;
  const note = str(f, "note").slice(0, 500);
  const id = num(f, "id");
  if (id) {
    const cur = await one<C>("SELECT id, room_id, tenant_id, end_date, status FROM contracts WHERE id=? AND room_id=?", id, roomId);
    if (!cur || cur.status !== "active") back(roomId, { err: "Chỉ sửa được hợp đồng đang hiệu lực" });
    await run("UPDATE contracts SET start_date=?, end_date=?, handover_date=?, notice_days=?, rent=?, deposit=?, rent_from_start=?, note=? WHERE id=?",
      start, end, handover, notice, rent, deposit, fromStart, note, id);
    await syncTenant(cur!, end, deposit);
    await logActivity(room.house_id, "contract", `Phòng ${room.code}: sửa hợp đồng (đến ${end})`, roomId);
    back(roomId, { ok: "Đã lưu hợp đồng" });
  }
  const t = await one<{ id: number }>("SELECT id FROM tenants WHERE room_id=? AND active=1", roomId);
  if (!t) back(roomId, { err: "Phòng chưa có khách. Thêm khách ở tab Thông tin chung trước" });
  if (await one("SELECT id FROM contracts WHERE room_id=? AND status='active'", roomId)) back(roomId, { err: "Phòng đã có hợp đồng đang hiệu lực" });
  await run("INSERT INTO contracts(room_id,tenant_id,start_date,end_date,handover_date,notice_days,rent,deposit,rent_from_start,status,note,created) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)",
    roomId, t!.id, start, end, handover, notice, rent, deposit, fromStart, note, today());
  await syncTenant({ id: 0, room_id: roomId, tenant_id: t!.id, end_date: end, status: "active" }, end, deposit);
  await logActivity(room.house_id, "contract", `Phòng ${room.code}: tạo hợp đồng ${start} đến ${end}`, roomId);
  back(roomId, { ok: "Đã tạo hợp đồng" });
}

/** Gia hạn: kéo dài ngày kết thúc, có thể đổi giá thuê ghi trong hợp đồng. Lịch sử giữ lại ngày hết hạn cũ. */
export async function renewContract(f: FormData) {
  await requireAdmin();
  const { c, house_id, code } = await loadContract(f);
  if (c.status !== "active") back(c.room_id, { err: "Hợp đồng đã chấm dứt, không gia hạn được" });
  const newEnd = dateOr(f, "new_end");
  if (!newEnd) back(c.room_id, { err: "Nhập ngày hết hạn mới" });
  if (isDate(c.end_date) && newEnd <= c.end_date) back(c.room_id, { err: "Ngày hết hạn mới phải sau ngày hết hạn hiện tại" });
  const rentRaw = str(f, "rent_after");
  const rentAfter = rentRaw === "" ? null : Math.max(0, num(f, "rent_after"));
  await batch([
    { sql: "INSERT INTO contract_events(contract_id,kind,event_date,detail,old_end,new_end,rent_after,created) VALUES (?,?,?,?,?,?,?,?)", args: [c.id, "renew", dateOr(f, "event_date") || today(), str(f, "detail").slice(0, 500), c.end_date, newEnd, rentAfter, new Date().toISOString()] },
    rentAfter === null
      ? { sql: "UPDATE contracts SET end_date=? WHERE id=?", args: [newEnd, c.id] }
      : { sql: "UPDATE contracts SET end_date=?, rent=? WHERE id=?", args: [newEnd, rentAfter, c.id] },
  ]);
  await syncTenant(c, newEnd);
  await logActivity(house_id, "contract", `Phòng ${code}: gia hạn hợp đồng đến ${newEnd}`, c.room_id);
  back(c.room_id, { ok: "Đã gia hạn hợp đồng" });
}

/** Phụ lục: ghi lại thay đổi giữa kỳ (đổi giá, đổi người ở...). Không tự đổi giá tính hóa đơn của phòng. */
export async function addAddendum(f: FormData) {
  await requireAdmin();
  const { c, house_id, code } = await loadContract(f);
  if (c.status !== "active") back(c.room_id, { err: "Hợp đồng đã chấm dứt, không thêm phụ lục được" });
  const detail = str(f, "detail").slice(0, 500);
  if (!detail) back(c.room_id, { err: "Ghi nội dung phụ lục" });
  const rentRaw = str(f, "rent_after");
  const rentAfter = rentRaw === "" ? null : Math.max(0, num(f, "rent_after"));
  await batch([
    { sql: "INSERT INTO contract_events(contract_id,kind,event_date,detail,old_end,new_end,rent_after,created) VALUES (?,?,?,?,?,?,?,?)", args: [c.id, "addendum", dateOr(f, "event_date") || today(), detail, c.end_date, c.end_date, rentAfter, new Date().toISOString()] },
    ...(rentAfter === null ? [] : [{ sql: "UPDATE contracts SET rent=? WHERE id=?", args: [rentAfter, c.id] }]),
  ]);
  await logActivity(house_id, "contract", `Phòng ${code}: thêm phụ lục hợp đồng`, c.room_id);
  back(c.room_id, { ok: "Đã ghi phụ lục" });
}

/** Chấm dứt hợp đồng: ngày, lý do, cọc hoàn trả hoặc khấu trừ. Chỉ trả phòng khi anh tích ô tương ứng. */
export async function terminateContract(f: FormData) {
  await requireAdmin();
  const { c, house_id, code } = await loadContract(f);
  if (c.status !== "active") back(c.room_id, { err: "Hợp đồng đã chấm dứt rồi" });
  const date = dateOr(f, "event_date") || today();
  const returned = Math.max(0, num(f, "deposit_returned")), deducted = Math.max(0, num(f, "deposit_deducted"));
  await batch([
    { sql: "INSERT INTO contract_events(contract_id,kind,event_date,detail,old_end,new_end,deposit_returned,deposit_deducted,created) VALUES (?,?,?,?,?,?,?,?,?)", args: [c.id, "terminate", date, str(f, "detail").slice(0, 500), c.end_date, date, returned, deducted, new Date().toISOString()] },
    { sql: "UPDATE contracts SET status='terminated' WHERE id=?", args: [c.id] },
  ]);
  if (f.get("checkout") && c.tenant_id) {
    await run("UPDATE tenants SET active=0, move_out=? WHERE id=? AND active=1", date, c.tenant_id);
    await logActivity(house_id, "checkout", `Phòng ${code}: khách trả phòng`, c.room_id);
  }
  await logActivity(house_id, "contract", `Phòng ${code}: chấm dứt hợp đồng ngày ${date}`, c.room_id);
  back(c.room_id, { ok: f.get("checkout") ? "Đã chấm dứt hợp đồng và trả phòng" : "Đã chấm dứt hợp đồng" });
}
