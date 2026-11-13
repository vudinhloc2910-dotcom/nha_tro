"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPassword, clearSession, requireAdmin, setSession } from "@/lib/auth";
import { all, one, run } from "@/lib/db";
import { generateInvoice } from "@/lib/billing";
import { parseImport, runImport } from "@/lib/import-sheet";
import { today } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = Number(String(f.get(k) ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (f: FormData) => {
  const m = str(f, "month");
  if (!MONTH_RE.test(m)) throw new Error("Tháng không hợp lệ");
  return m;
};
const refresh = () => revalidatePath("/", "layout");
const back = (path: string, params: Record<string, string>) =>
  redirect(`${path}?${new URLSearchParams(params).toString()}`);

/* ---------- Đăng nhập ---------- */
export async function login(f: FormData) {
  if (checkPassword(str(f, "password"))) {
    await setSession();
    redirect("/");
  }
  await new Promise((r) => setTimeout(r, 800)); // làm chậm việc dò mật khẩu
  redirect("/login?err=1");
}
export async function logout() {
  await clearSession();
  redirect("/login");
}

/* ---------- Phòng & khách ---------- */
export async function addRoom(f: FormData) {
  await requireAdmin();
  const code = str(f, "code");
  if (!code) back("/rooms", { err: "Nhập số phòng" });
  if (await one("SELECT id FROM rooms WHERE code=?", code)) back("/rooms", { err: `Phòng ${code} đã có` });
  const r = await run("INSERT INTO rooms(code, rent, due_day) VALUES (?,?,?)", code, num(f, "rent"), num(f, "due_day") || 15);
  refresh();
  redirect(`/rooms/${r.lastInsertRowid}`);
}
export async function saveRoom(f: FormData) {
  await requireAdmin();
  const id = num(f, "id");
  const due = Math.min(31, Math.max(1, num(f, "due_day") || 15));
  await run("UPDATE rooms SET rent=?, due_day=?, note=? WHERE id=?", Math.max(0, num(f, "rent")), due, str(f, "note"), id);
  refresh();
  back(`/rooms/${id}`, { ok: "Đã lưu phòng" });
}
export async function saveTenant(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const name = str(f, "name");
  if (!name) back(`/rooms/${roomId}`, { err: "Nhập tên khách" });
  const vals = [name, str(f, "phone"), Math.max(1, num(f, "people") || 1), str(f, "move_in"), Math.max(0, num(f, "deposit"))] as const;
  const cur = await one<{ id: number }>("SELECT id FROM tenants WHERE room_id=? AND active=1", roomId);
  if (cur) await run("UPDATE tenants SET name=?, phone=?, people=?, move_in=?, deposit=? WHERE id=?", ...vals, cur.id);
  else await run("INSERT INTO tenants(name, phone, people, move_in, deposit, room_id) VALUES (?,?,?,?,?,?)", ...vals, roomId);
  refresh();
  back(`/rooms/${roomId}`, { ok: "Đã lưu khách thuê" });
}
export async function checkoutTenant(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  await run("UPDATE tenants SET active=0, move_out=? WHERE room_id=? AND active=1", today(), roomId);
  refresh();
  back(`/rooms/${roomId}`, { ok: "Đã trả phòng" });
}

/* ---------- Cài đặt ---------- */
export async function saveSettings(f: FormData) {
  await requireAdmin();
  const keys = ["house_name", "elec_price", "water_mode", "water_price", "bank_code", "bank_account", "bank_holder"];
  for (const k of keys) {
    let v = str(f, k);
    if (k === "water_mode" && v !== "meter" && v !== "person") v = "meter";
    if (k === "bank_account") v = v.replace(/\s+/g, "");
    await run("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, v);
  }
  refresh();
  back("/settings", { ok: "Đã lưu cài đặt. Hóa đơn đã tạo cần bấm 'Tính lại' để áp dụng giá mới." });
}
export async function saveService(f: FormData) {
  await requireAdmin();
  const id = num(f, "id");
  const type = str(f, "type") === "person" ? "person" : "room";
  const name = str(f, "name");
  if (!name) back("/settings", { err: "Nhập tên dịch vụ" });
  if (id) await run("UPDATE services SET name=?, type=?, price=?, active=? WHERE id=?", name, type, Math.max(0, num(f, "price")), f.get("active") ? 1 : 0, id);
  else await run("INSERT INTO services(name,type,price) VALUES (?,?,?)", name, type, Math.max(0, num(f, "price")));
  refresh();
  back("/settings", { ok: "Đã lưu dịch vụ" });
}
export async function deleteService(f: FormData) {
  await requireAdmin();
  await run("DELETE FROM services WHERE id=?", num(f, "id"));
  refresh();
  back("/settings", { ok: "Đã xóa dịch vụ (hóa đơn cũ giữ nguyên)" });
}

/* ---------- Chỉ số điện nước ---------- */
export async function saveReadings(f: FormData) {
  await requireAdmin();
  const m = month(f);
  const ids = str(f, "ids").split(",").map(Number).filter(Boolean);
  const errors: string[] = [];
  let saved = 0;
  for (const id of ids) {
    const en = str(f, `en_${id}`), wn = str(f, `wn_${id}`);
    if (en === "" && wn === "") continue;
    const eo = num(f, `eo_${id}`), wo = num(f, `wo_${id}`);
    const enN = en === "" ? eo : num(f, `en_${id}`);
    const wnN = wn === "" ? wo : num(f, `wn_${id}`);
    const code = (await one<{ code: string }>("SELECT code FROM rooms WHERE id=?", id))?.code ?? String(id);
    if (enN < eo) { errors.push(`Phòng ${code}: số điện mới (${enN}) nhỏ hơn số cũ (${eo})`); continue; }
    if (wnN < wo) { errors.push(`Phòng ${code}: số nước mới (${wnN}) nhỏ hơn số cũ (${wo})`); continue; }
    await run(
      `INSERT INTO readings(room_id,month,elec_old,elec_new,water_old,water_new) VALUES (?,?,?,?,?,?)
       ON CONFLICT(room_id,month) DO UPDATE SET elec_old=excluded.elec_old, elec_new=excluded.elec_new, water_old=excluded.water_old, water_new=excluded.water_new`,
      id, m, eo, enN, wo, wnN
    );
    saved++;
  }
  refresh();
  const p: Record<string, string> = { month: m };
  if (errors.length) p.err = errors.join(" | ");
  if (saved) p.ok = `Đã lưu ${saved} phòng`;
  back("/readings", p);
}

/* ---------- Hóa đơn ---------- */
export async function generateInvoices(f: FormData) {
  await requireAdmin();
  const m = month(f);
  const rooms = await all<{ id: number }>("SELECT id FROM rooms ORDER BY code");
  let n = 0;
  for (const r of rooms) if (await generateInvoice(r.id, m)) n++;
  refresh();
  back("/invoices", { month: m, ok: `Đã tạo/tính lại ${n} hóa đơn` });
}
const LOCKED_MSG = "Hóa đơn này nhập từ sheet nên đã khóa. Bấm 'Mở khóa' nếu muốn sửa và tính lại.";
export async function unlockInvoice(f: FormData) {
  await requireAdmin();
  const id = num(f, "invoice_id");
  await run("UPDATE invoices SET locked=0 WHERE id=?", id);
  refresh();
  back(`/invoices/${id}`, { ok: "Đã mở khóa. Bấm 'Tính lại' sẽ tính theo giá hiện tại và thay các khoản đã nhập." });
}
export async function regenerateInvoice(f: FormData) {
  await requireAdmin();
  const inv = await one<{ room_id: number; month: string; locked: number }>("SELECT room_id, month, locked FROM invoices WHERE id=?", num(f, "invoice_id"));
  if (!inv) redirect("/invoices");
  if (inv.locked) back(`/invoices/${num(f, "invoice_id")}`, { err: LOCKED_MSG });
  await generateInvoice(inv.room_id, inv.month);
  refresh();
  back(`/invoices/${num(f, "invoice_id")}`, { ok: "Đã tính lại hóa đơn" });
}
export async function addExtra(f: FormData) {
  await requireAdmin();
  const invId = num(f, "invoice_id");
  const inv = await one<{ room_id: number; month: string; locked: number }>("SELECT room_id, month, locked FROM invoices WHERE id=?", invId);
  if (!inv) redirect("/invoices");
  if (inv.locked) back(`/invoices/${invId}`, { err: LOCKED_MSG });
  const name = str(f, "name");
  const amount = Math.round(num(f, "amount"));
  if (!name || !amount) back(`/invoices/${invId}`, { err: "Nhập tên và số tiền phát sinh" });
  await run("INSERT INTO extras(room_id,month,name,amount) VALUES (?,?,?,?)", inv.room_id, inv.month, name, amount);
  await generateInvoice(inv.room_id, inv.month);
  refresh();
  back(`/invoices/${invId}`, { ok: "Đã thêm khoản phát sinh" });
}
export async function deleteExtra(f: FormData) {
  await requireAdmin();
  const invId = num(f, "invoice_id");
  const inv = await one<{ room_id: number; month: string; locked: number }>("SELECT room_id, month, locked FROM invoices WHERE id=?", invId);
  if (!inv) redirect("/invoices");
  if (inv.locked) back(`/invoices/${invId}`, { err: LOCKED_MSG });
  await run("DELETE FROM extras WHERE id=? AND room_id=? AND month=?", num(f, "extra_id"), inv.room_id, inv.month);
  await generateInvoice(inv.room_id, inv.month);
  refresh();
  back(`/invoices/${invId}`, { ok: "Đã xóa khoản phát sinh" });
}

/* ---------- Nhập dữ liệu từ sheet ---------- */
export async function importSheetAction(f: FormData) {
  await requireAdmin();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) back("/import", { err: "Hãy chọn file import-sheet.json" });
  if ((file as File).size > 2_000_000) back("/import", { err: "File quá lớn (tối đa 2MB)" });
  let result: Awaited<ReturnType<typeof runImport>> | null = null;
  let error = "";
  try {
    const data = parseImport(JSON.parse(await (file as File).text()));
    result = await runImport(data, { dry: f.get("mode") === "dry", applySettings: !!f.get("apply_settings") });
  } catch (e) {
    error = e instanceof SyntaxError ? "File không phải JSON hợp lệ." : e instanceof Error ? e.message : "Lỗi không xác định";
  }
  refresh();
  if (!result) back("/import", { err: error });
  back("/import", { ok: result!.summary, notes: result!.notes.join(" | ") });
}

/* ---------- Thu tiền ---------- */
export async function addPayment(f: FormData) {
  await requireAdmin();
  const invId = num(f, "invoice_id");
  const amount = Math.round(num(f, "amount"));
  if (amount <= 0) back(`/invoices/${invId}`, { err: "Số tiền thu phải lớn hơn 0" });
  const method = str(f, "method") === "cash" ? "cash" : "bank";
  await run("INSERT INTO payments(invoice_id,amount,method,paid_at,note) VALUES (?,?,?,?,?)", invId, amount, method, str(f, "paid_at") || today(), str(f, "note"));
  refresh();
  back(`/invoices/${invId}`, { ok: "Đã ghi nhận thu tiền" });
}
export async function deletePayment(f: FormData) {
  await requireAdmin();
  const invId = num(f, "invoice_id");
  await run("DELETE FROM payments WHERE id=? AND invoice_id=?", num(f, "payment_id"), invId);
  refresh();
  back(`/invoices/${invId}`, { ok: "Đã xóa khoản thu" });
}
