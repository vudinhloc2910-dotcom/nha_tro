"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPassword, clearSession, requireAdmin, setPassword, setSession } from "@/lib/auth";
import { setSelectedMonth } from "@/lib/month";
import { all, batch, one, run } from "@/lib/db";
import { currentHouse, setCurrentHouse } from "@/lib/house";
import { generateInvoice, generateMonth, saveInvoice } from "@/lib/billing";
import { addMonths, isWaterMode } from "@/lib/calc";
import { loadMonth } from "@/lib/monthdata";
import { logActivity } from "@/lib/activity";
import { parseImport, runImport } from "@/lib/import-sheet";
import { today } from "@/lib/format";
import { closeContractsOnCheckout, syncContractFromTenant } from "@/lib/contracts-db";

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
  if (await checkPassword(str(f, "password"))) {
    await setSession();
    redirect("/");
  }
  await new Promise((r) => setTimeout(r, 800)); // làm chậm việc dò mật khẩu
  redirect("/login?err=1");
}
/** Đổi mật khẩu đăng nhập: cần mật khẩu hiện tại; đổi xong các máy khác bị đăng xuất, máy này giữ đăng nhập. */
export async function changePassword(f: FormData) {
  await requireAdmin();
  const cur = str(f, "current"), next = String(f.get("next") ?? ""), again = String(f.get("confirm") ?? "");
  if (!(await checkPassword(cur))) {
    await new Promise((r) => setTimeout(r, 800));
    back("/account", { err: "Mật khẩu hiện tại chưa đúng" });
  }
  if (next.length < 8) back("/account", { err: "Mật khẩu mới phải từ 8 ký tự" });
  if (next !== again) back("/account", { err: "Hai lần nhập mật khẩu mới chưa giống nhau" });
  if (next === cur) back("/account", { err: "Mật khẩu mới phải khác mật khẩu cũ" });
  const ver = await setPassword(next);
  await setSession(ver);
  back("/account", { ok: "Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới." });
}

/** Chọn tháng làm việc (lưu cookie) rồi quay lại trang đang xem. */
export async function selectMonth(f: FormData) {
  await requireAdmin();
  await setSelectedMonth(str(f, "month"));
  const to = str(f, "back");
  redirect(to.startsWith("/") && !to.startsWith("//") ? to : "/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

/* ---------- Nhà ---------- */
export async function selectHouse(f: FormData) {
  await requireAdmin();
  const id = num(f, "house");
  if (!(await one("SELECT id FROM houses WHERE id=?", id))) return;
  await setCurrentHouse(id);
  const to = str(f, "back");
  redirect(to.startsWith("/") && !to.startsWith("//") ? to : "/");
}
export async function addHouse(f: FormData) {
  await requireAdmin();
  const name = str(f, "name");
  if (!name) back("/settings", { err: "Nhập tên nhà" });
  const r = await run("INSERT INTO houses(name,address,sort) VALUES (?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM houses))", name, str(f, "address"));
  await setCurrentHouse(r.lastInsertRowid);
  refresh();
  back("/settings", { ok: `Đã thêm nhà "${name}". Hãy cài giá điện, nước và tài khoản nhận tiền cho nhà này.` });
}

/* ---------- Phòng & khách ---------- */
export async function addRoom(f: FormData) {
  await requireAdmin();
  const code = str(f, "code");
  if (!code) back("/rooms", { err: "Nhập số phòng" });
  const house = await currentHouse();
  if (await one("SELECT id FROM rooms WHERE house_id=? AND code=?", house.id, code)) back("/rooms", { err: `Phòng ${code} đã có` });
  const r = await run("INSERT INTO rooms(house_id, code, rent, due_day) VALUES (?,?,?,?)", house.id, code, num(f, "rent"), num(f, "due_day") || 15);
  refresh();
  redirect(`/rooms/${r.lastInsertRowid}`);
}
export async function saveRoom(f: FormData) {
  await requireAdmin();
  const id = num(f, "id");
  const due = Math.min(31, Math.max(1, num(f, "due_day") || 15));
  const cur = await one<{ house_id: number; code: string }>("SELECT house_id, code FROM rooms WHERE id=?", id);
  if (!cur) back("/rooms", { err: "Không tìm thấy phòng" });
  const code = str(f, "code").slice(0, 30) || cur!.code;
  if (code !== cur!.code && (await one("SELECT id FROM rooms WHERE house_id=? AND code=? AND id<>?", cur!.house_id, code, id))) back(`/rooms/${id}`, { err: `Tên "${code}" đã có phòng khác dùng` });
  await run("UPDATE rooms SET code=?, floor_label=?, kind=?, rent=?, due_day=?, note=? WHERE id=?", code, str(f, "floor_label").slice(0, 40), str(f, "kind").slice(0, 40), Math.max(0, num(f, "rent")), due, str(f, "note"), id);
  refresh();
  back(`/rooms/${id}`, { ok: "Đã lưu phòng" });
}
/** Cách thu nước và đơn giá nước riêng của một phòng (tab Giá và phí). "default" = theo cài đặt chung của nhà. */
export async function saveRoomWater(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const house = await currentHouse();
  const room = await one<{ id: number }>("SELECT id FROM rooms WHERE id=? AND house_id=?", roomId, house.id);
  if (!room) back("/rooms", { err: "Không tìm thấy phòng" });
  const mode = str(f, "water_mode");
  if (mode !== "default" && !isWaterMode(mode)) back(`/rooms/${roomId}`, { tab: "price", err: "Cách tính nước không hợp lệ" });
  const priceRaw = str(f, "water_price");
  const price = priceRaw === "" ? null : Math.round(num(f, "water_price"));
  if (price !== null && price < 0) back(`/rooms/${roomId}`, { tab: "price", err: "Đơn giá nước không được âm" });
  await batch([
    mode === "default"
      ? { sql: "DELETE FROM room_prefs WHERE room_id=? AND key='water_mode'", args: [roomId] }
      : { sql: "INSERT INTO room_prefs(room_id,key,value) VALUES (?,?,?) ON CONFLICT(room_id,key) DO UPDATE SET value=excluded.value", args: [roomId, "water_mode", mode] },
    price === null
      ? { sql: "DELETE FROM room_prefs WHERE room_id=? AND key='water_price'", args: [roomId] }
      : { sql: "INSERT INTO room_prefs(room_id,key,value) VALUES (?,?,?) ON CONFLICT(room_id,key) DO UPDATE SET value=excluded.value", args: [roomId, "water_price", String(price)] },
  ]);
  refresh();
  back(`/rooms/${roomId}`, { tab: "price", ok: "Đã lưu cách tính nước của phòng. Hóa đơn tháng đã lưu sẽ tính lại khi anh sửa một ô của phòng này trong lưới." });
}
export async function saveTenant(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const name = str(f, "name");
  if (!name) back(`/rooms/${roomId}`, { err: "Nhập tên khách" });
  const end = /^\d{4}-\d{2}-\d{2}$/.test(str(f, "contract_end")) ? str(f, "contract_end") : "";
  const vals = [name, str(f, "phone"), Math.max(1, num(f, "people") || 1), str(f, "move_in"), Math.max(0, num(f, "deposit")), end, f.get("residence_done") ? 1 : 0] as const;
  const cur = await one<{ id: number }>("SELECT id FROM tenants WHERE room_id=? AND active=1", roomId);
  const rinfo = await one<{ house_id: number; code: string }>("SELECT house_id, code FROM rooms WHERE id=?", roomId);
  let tenantId = cur?.id ?? 0;
  if (cur) await run("UPDATE tenants SET name=?, phone=?, people=?, move_in=?, deposit=?, contract_end=?, residence_done=? WHERE id=?", ...vals, cur.id);
  else {
    const ins = await run("INSERT INTO tenants(name, phone, people, move_in, deposit, contract_end, residence_done, room_id) VALUES (?,?,?,?,?,?,?,?)", ...vals, roomId);
    tenantId = Number(ins.lastInsertRowid);
    if (rinfo) await logActivity(rinfo.house_id, "checkin", `Phòng ${rinfo.code}: khách mới ${name} vào ở`, roomId);
  }
  // Giữ hợp đồng khớp với ô "Hợp đồng đến ngày" (cột Hợp đồng và nhắc hết hạn đều dựa vào đây)
  if (tenantId && end) await syncContractFromTenant(tenantId, roomId, str(f, "move_in"), end, Math.max(0, num(f, "deposit")));
  refresh();
  back(`/rooms/${roomId}`, { ok: "Đã lưu khách thuê" });
}
export async function checkoutTenant(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const rinfo = await one<{ house_id: number; code: string }>("SELECT house_id, code FROM rooms WHERE id=?", roomId);
  await run("UPDATE tenants SET active=0, move_out=? WHERE room_id=? AND active=1", today(), roomId);
  await closeContractsOnCheckout(roomId, today());
  if (rinfo) await logActivity(rinfo.house_id, "checkout", `Phòng ${rinfo.code}: khách trả phòng`, roomId);
  refresh();
  back(`/rooms/${roomId}`, { ok: "Đã trả phòng" });
}

/* ---------- Cài đặt ---------- */
export async function saveSettings(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const name = str(f, "house_name");
  if (!name) back("/settings", { err: "Nhập tên nhà" });
  await run("UPDATE houses SET name=?, address=? WHERE id=?", name, str(f, "house_address"), house.id);
  const keys = ["house_phone", "elec_price", "water_mode", "water_price", "bank_code", "bank_account", "bank_holder", "rent_cost_monthly", "manager_salary", "partners", "invoice_note"];
  for (const k of keys) {
    let v = str(f, k);
    if (k === "water_mode" && v !== "meter" && v !== "person") v = "meter";
    if (k === "bank_account") v = v.replace(/\s+/g, "");
    if (k === "rent_cost_monthly" || k === "manager_salary") v = String(Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0));
    await run("INSERT INTO house_settings(house_id,key,value) VALUES (?,?,?) ON CONFLICT(house_id,key) DO UPDATE SET value=excluded.value", house.id, k, v);
  }
  refresh();
  back("/settings", { ok: "Đã lưu cài đặt. Hóa đơn đã tạo cần bấm 'Tính lại' để áp dụng giá mới." });
}
/* ---------- Đồng hồ điện chung của nhà (VD nhà vệ sinh dùng chung một tầng) ---------- */
/** Lưu cấu hình các đồng hồ chung. parts là chữ dạng "201:2, 202:1" (số phòng:số phần). */
export async function saveSharedMeterConfig(items: { id: string; name: string; start: string; parts: string }[]): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const house = await currentHouse();
    const roomRows = await all<{ id: number; code: string }>("SELECT id, code FROM rooms WHERE house_id=?", house.id);
    const byCode = new Map(roomRows.map((r) => [r.code, Number(r.id)]));
    const out: { id: string; name: string; start: number; rooms: { roomId: number; parts: number }[] }[] = [];
    const used = new Set<string>();
    for (const it of (items ?? []).slice(0, 12)) {
      const name = String(it.name ?? "").trim().slice(0, 60);
      if (!name) continue;
      const startN = Number(String(it.start ?? "").trim().replace(",", ".") || 0);
      if (!Number.isFinite(startN) || startN < 0) return { ok: false, error: `Số đầu vào của "${name}" phải là số` };
      const rooms: { roomId: number; parts: number }[] = [];
      for (const piece of String(it.parts ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
        const m = piece.match(/^(.+?)\s*[:=]\s*([\d.,]+)$/);
        if (!m) return { ok: false, error: `Phần chia "${piece}" của "${name}" chưa đúng. Viết dạng 201:2, 202:1 (số phòng, dấu hai chấm, số phần)` };
        const roomId = byCode.get(m[1].trim());
        const parts = Number(m[2].replace(",", "."));
        if (!roomId) return { ok: false, error: `Không có phòng "${m[1].trim()}" trong nhà này` };
        if (!(parts > 0)) return { ok: false, error: `Số phần của phòng ${m[1].trim()} phải lớn hơn 0` };
        rooms.push({ roomId, parts });
      }
      if (rooms.length === 0) return { ok: false, error: `Đồng hồ "${name}" chưa có phòng nào` };
      let id = /^[a-z0-9_]{1,20}$/.test(String(it.id ?? "")) ? String(it.id) : "";
      if (!id || used.has(id)) id = `m${Date.now().toString(36)}${out.length}`.slice(0, 20);
      used.add(id);
      out.push({ id, name, start: startN, rooms });
    }
    await run("INSERT INTO house_settings(house_id,key,value) VALUES (?,?,?) ON CONFLICT(house_id,key) DO UPDATE SET value=excluded.value", house.id, "shared_meters", JSON.stringify(out));
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không lưu được" };
  }
}

/** Lưu số đồng hồ chung của một tháng rồi tính lại hóa đơn các phòng được chia. */
export async function saveSharedReadings(houseId: number, month: string, entries: { id: string; old: string; new: string }[]): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
    const base = await loadMonth(Number(houseId), month);
    const st: { sql: string; args: (string | number)[] }[] = [];
    const H = Number(houseId);
    const affected = new Set<number>();
    for (const e of entries ?? []) {
      const m = base.sharedMeters.find((x) => x.id === e.id);
      if (!m) continue;
      const n = toNum(e.new), o = toNum(e.old);
      if ((n !== null && Number.isNaN(n)) || (o !== null && Number.isNaN(o))) return { ok: false, error: `Số của "${m.name}" phải là số` };
      const oldV = o ?? m.oldAuto;
      if (n !== null && n < oldV) return { ok: false, error: `${m.name}: số mới (${n}) nhỏ hơn số cũ (${oldV})` };
      const del = (key: string) => st.push({ sql: "DELETE FROM house_settings WHERE house_id=? AND key=?", args: [H, key] });
      const put = (key: string, v: number) => st.push({ sql: "INSERT INTO house_settings(house_id,key,value) VALUES (?,?,?) ON CONFLICT(house_id,key) DO UPDATE SET value=excluded.value", args: [H, key, String(v)] });
      if (n === null) del(`sm:${m.id}:${month}`); else put(`sm:${m.id}:${month}`, n);
      if (o === null || o === m.oldAuto) del(`smo:${m.id}:${month}`); else put(`smo:${m.id}:${month}`, o);
      for (const r of m.rooms) affected.add(r.roomId);
    }
    if (st.length) await batch(st);
    const fresh = await loadMonth(H, month);
    for (const r of fresh.rooms) {
      if (!affected.has(r.id) || !(r.hasReading || r.invoice)) continue;
      await saveInvoice(r, month, { force: true, houseId: H });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không lưu được" };
  }
}

export async function saveService(f: FormData) {
  await requireAdmin();
  const id = num(f, "id");
  const type = str(f, "type") === "person" ? "person" : str(f, "type") === "vehicle" ? "vehicle" : "room";
  const name = str(f, "name");
  if (!name) back("/settings", { err: "Nhập tên dịch vụ" });
  const house = await currentHouse();
  if (id) await run("UPDATE services SET name=?, type=?, price=?, active=? WHERE id=? AND house_id=?", name, type, Math.max(0, num(f, "price")), f.get("active") ? 1 : 0, id, house.id);
  else await run("INSERT INTO services(house_id,name,type,price) VALUES (?,?,?,?)", house.id, name, type, Math.max(0, num(f, "price")));
  refresh();
  back("/settings", { ok: "Đã lưu dịch vụ" });
}
export async function deleteService(f: FormData) {
  await requireAdmin();
  await run("DELETE FROM services WHERE id=? AND house_id=?", num(f, "id"), (await currentHouse()).id);
  refresh();
  const to = str(f, "back");
  back(to.startsWith("/") && !to.startsWith("//") ? to : "/settings", { ok: "Đã xóa dịch vụ (hóa đơn cũ giữ nguyên)", ...(to.includes("/rooms/") ? { tab: "price" } : {}) });
}

/* ---------- Chỉ số điện nước ---------- */
async function processReadings(f: FormData, m: string) {
  const ids = str(f, "ids").split(",").map(Number).filter(Boolean);
  const errors: string[] = [];
  const saved: number[] = [];
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
    saved.push(id);
  }
  return { saved, errors };
}

export async function saveReadings(f: FormData) {
  await requireAdmin();
  const m = month(f);
  const { saved, errors } = await processReadings(f, m);
  refresh();
  const p: Record<string, string> = { month: m };
  if (errors.length) p.err = errors.join(" | ");
  if (saved.length) p.ok = `Đã lưu ${saved.length} phòng`;
  back("/readings", p);
}

/** Trang "Hóa đơn tháng": lưu chỉ số điện nước và tạo hóa đơn (link cho khách) bằng một nút. */
export async function saveAndGenerate(f: FormData) {
  await requireAdmin();
  const m = month(f);
  const { saved, errors } = await processReadings(f, m);
  let made = 0;
  for (const id of saved) if (await generateInvoice(id, m)) made++;
  refresh();
  const p: Record<string, string> = { month: m };
  if (errors.length) p.err = errors.join(" | ");
  if (made) p.ok = `Đã tạo ${made} hóa đơn. Bấm "Chép link" hoặc "Chép tin nhắn" ở từng phòng để gửi khách.`;
  else if (!errors.length) p.err = "Chưa có phòng nào được nhập số mới.";
  back("/", p);
}

/* ---------- Hóa đơn ---------- */
export async function generateInvoices(f: FormData) {
  await requireAdmin();
  const m = month(f);
  const n = await generateMonth((await currentHouse()).id, m);
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
  if (!(file instanceof File) || file.size === 0) back("/import", { err: "Hãy chọn file dữ liệu (.json)" });
  if ((file as File).size > 3_000_000) back("/import", { err: "File quá lớn (tối đa 3MB)" });
  let result: Awaited<ReturnType<typeof runImport>> | null = null;
  let error = "";
  try {
    const data = parseImport(JSON.parse(await (file as File).text()));
    // File ghi rõ tên nhà thì nạp đúng nhà đó (không phụ thuộc nhà đang chọn trên thanh trên cùng)
    const target = data.house ? await one<{ id: number; name: string }>("SELECT id, name FROM houses WHERE name=?", data.house) : undefined;
    if (data.house && !target) throw new Error(`Chưa có nhà "${data.house}" trong web. Hãy thêm nhà đó trong Cài đặt hoặc kiểm tra lại tên nhà.`);
    const house = target ?? (await currentHouse());
    if (f.get("mode") !== "dry") await setCurrentHouse(house.id);
    result = await runImport(data, { houseId: house.id, houseName: house.name, dry: f.get("mode") === "dry", applySettings: !!f.get("apply_settings") });
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
  await run("UPDATE invoices SET state='' WHERE id=?", invId); // đã có tiền vào thì trạng thái tính lại tự động
  const pinfo = await one<{ house_id: number; code: string; room_id: number; month: string }>("SELECT r.house_id, r.code, r.id room_id, i.month FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.id=?", invId);
  if (pinfo) await logActivity(pinfo.house_id, "payment", `Phòng ${pinfo.code} đã đóng ${amount.toLocaleString("vi-VN")}đ (hóa đơn T${pinfo.month.slice(5)})`, pinfo.room_id);
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

/* ---------- Bảng hóa đơn tháng (kiểu sheet): lưu một phòng ---------- */
export type RoomMonthInput = {
  roomId: number; houseId: number; month: string;
  people: string; rent: string; periodStart: string; periodEnd: string;
  elecOld: string; elecNew: string; waterOld: string; waterNew: string;
  /** Đồng hồ điện phụ (chỉ có ở phòng đã bật) */
  auxOld?: string; auxNew?: string;
  svc: Record<string, string>; extras: { name: string; amount: string }[];
  discount: string; debt: string;
};
export type SaveResult =
  | { ok: true; invoice: { id: number; token: string; total: number; paid: number; due: string; locked: boolean; state?: string } | null }
  | { ok: false; error: string };

const toNum = (v: string | undefined) => {
  const t = String(v ?? "").trim().replace(/\s/g, "");
  if (t === "") return null;
  const n = Number(t.replace(/,/g, "."));
  return Number.isFinite(n) ? n : NaN;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lưu số liệu một phòng trong một tháng rồi tính lại hóa đơn. Được gọi tự động khi chủ trọ sửa xong một ô. */
export async function saveRoomMonth(inp: RoomMonthInput): Promise<SaveResult> {
  await requireAdmin();
  try {
    if (!MONTH_RE.test(inp.month)) return { ok: false, error: "Tháng không hợp lệ" };
    // houseId do trang gửi lên; loadMonth chỉ trả phòng của nhà đó nên phòng lạ sẽ bị từ chối (đỡ 1 lượt gọi database)
    const room = { id: Number(inp.roomId), house_id: Number(inp.houseId) };
    const base = (await loadMonth(room.house_id, inp.month)).rooms.find((r) => r.id === room.id);
    if (!base) return { ok: false, error: "Không tìm thấy phòng, hoặc phòng chưa có khách thuê" };

    const eo = toNum(inp.elecOld), en = toNum(inp.elecNew), wo = toNum(inp.waterOld), wn = toNum(inp.waterNew);
    for (const [v, name] of [[eo, "điện cũ"], [en, "điện mới"], [wo, "nước cũ"], [wn, "nước mới"], [toNum(inp.people), "số người"], [toNum(inp.rent), "tiền phòng"], [toNum(inp.discount), "giảm giá"], [toNum(inp.debt), "nợ cũ"]] as const) {
      if (v !== null && Number.isNaN(v)) return { ok: false, error: `Ô "${name}" phải là số` };
    }
    if (en !== null && en < (eo ?? 0)) return { ok: false, error: `Số điện mới (${en}) nhỏ hơn số cũ (${eo ?? 0})` };
    if (wn !== null && wn < (wo ?? 0)) return { ok: false, error: `Số nước mới (${wn}) nhỏ hơn số cũ (${wo ?? 0})` };
    const ao = toNum(inp.auxOld), an = toNum(inp.auxNew);
    for (const [v, name] of [[ao, "đồng hồ phụ cũ"], [an, "đồng hồ phụ mới"]] as const) {
      if (v !== null && Number.isNaN(v)) return { ok: false, error: `Ô "${name}" phải là số` };
    }
    if (an !== null && an < (ao ?? base.auxOldAuto)) return { ok: false, error: `Số đồng hồ phụ mới (${an}) nhỏ hơn số cũ (${ao ?? base.auxOldAuto})` };
    for (const d of [inp.periodStart, inp.periodEnd]) if (d && !DATE_RE.test(d)) return { ok: false, error: "Kỳ hạn phải là ngày hợp lệ" };

    const R = room.id, M = inp.month;
    const st: { sql: string; args: (string | number | null)[] }[] = [];
    // Số liệu tháng: chỉ lưu khi KHÁC giá trị tự động (để thay đổi sau này ở cài đặt còn có tác dụng)
    const setMonth = (key: string, value: string | null, auto: string | null) => {
      if (value === null || value === "" || value === auto) st.push({ sql: "DELETE FROM room_month WHERE room_id=? AND month=? AND key=?", args: [R, M, key] });
      else st.push({ sql: "INSERT INTO room_month(room_id,month,key,value) VALUES (?,?,?,?) ON CONFLICT(room_id,month,key) DO UPDATE SET value=excluded.value", args: [R, M, key, value] });
    };
    const people = toNum(inp.people);
    setMonth("people", people === null ? null : String(Math.max(1, Math.round(people))), String(base.tenantPeople));
    const rent = toNum(inp.rent);
    setMonth("rent", rent === null ? null : String(Math.round(rent)), String(base.rent));
    const debt = toNum(inp.debt);
    setMonth("debt", debt === null ? null : String(Math.round(debt)), String(base.auto.debt));
    const discount = toNum(inp.discount);
    setMonth("discount", discount === null || discount === 0 ? null : String(Math.round(discount)), null);
    // Kỳ thu luôn lưu đúng ngày chủ trọ nhập, kể cả khi trùng ngày tự tính (trước đây trùng thì bị xóa và web quay về ngày cũ của hóa đơn, nên cứ "nhảy về 15")
    const up = "INSERT INTO room_month(room_id,month,key,value) VALUES (?,?,?,?) ON CONFLICT(room_id,month,key) DO UPDATE SET value=excluded.value";
    if (inp.periodStart) st.push({ sql: up, args: [R, M, "p_start", inp.periodStart] }); // ngày trống: giữ nguyên kỳ thu đã lưu
    // Ngày đóng tiền của phòng = ngày bắt đầu kỳ thu: sửa kỳ thu của tháng mới nhất thì các tháng sau tự theo ngày đó
    if (inp.periodStart && DATE_RE.test(inp.periodStart) && inp.periodStart !== base.auto.periodStart) {
      st.push({ sql: "UPDATE rooms SET due_day=? WHERE id=? AND COALESCE((SELECT MAX(month) FROM invoices WHERE room_id=?), '') <= ?", args: [Number(inp.periodStart.slice(8, 10)), R, R, M] });
    }
    if (inp.periodEnd) st.push({ sql: up, args: [R, M, "p_end", inp.periodEnd] });
    for (const [sid, v] of Object.entries(inp.svc ?? {})) {
      if (!/^\d+$/.test(sid)) continue;
      const n = toNum(v);
      if (n !== null && Number.isNaN(n)) return { ok: false, error: "Ô dịch vụ phải là số" };
      setMonth(`svc:${sid}`, n === null ? null : String(Math.round(n)), null);
    }
    // Phụ phí phát sinh của tháng: thay toàn bộ danh sách
    st.push({ sql: "DELETE FROM extras WHERE room_id=? AND month=?", args: [R, M] });
    for (const e of (inp.extras ?? []).slice(0, 30)) {
      const name = String(e.name ?? "").trim().slice(0, 80);
      const amount = toNum(e.amount);
      if (amount !== null && Number.isNaN(amount)) return { ok: false, error: "Số tiền phụ phí phải là số" };
      if (name && amount) st.push({ sql: "INSERT INTO extras(room_id,month,name,amount) VALUES (?,?,?,?)", args: [R, M, name, Math.round(amount)] });
    }
    // Đồng hồ điện phụ: chỉ lưu cho phòng đã bật; số cũ trùng số tự động thì không lưu (để tháng trước sửa còn tự nối)
    if (base.prefs.aux) {
      setMonth("aux_old", ao === null ? null : String(ao), String(base.auxOldAuto));
      setMonth("aux_new", an === null ? null : String(an), null);
    }
    // Chỉ số điện nước
    if (en !== null || wn !== null) {
      const eOld = eo ?? 0, wOld = wo ?? 0;
      st.push({
        sql: `INSERT INTO readings(room_id,month,elec_old,elec_new,water_old,water_new) VALUES (?,?,?,?,?,?)
              ON CONFLICT(room_id,month) DO UPDATE SET elec_old=excluded.elec_old, elec_new=excluded.elec_new, water_old=excluded.water_old, water_new=excluded.water_new`,
        args: [R, M, eOld, en ?? eOld, wOld, wn ?? wOld],
      });
    }
    // Số người là số hiện tại của phòng: nếu đang sửa tháng mới nhất thì cập nhật luôn cho các tháng sau
    if (people !== null) {
      // Điều kiện nằm ngay trong câu lệnh (không cần đọc trước): chỉ cập nhật khi tháng đang sửa là tháng mới nhất của phòng
      st.push({ sql: "UPDATE tenants SET people=? WHERE id=? AND COALESCE((SELECT MAX(month) FROM invoices WHERE room_id=?), '') <= ?", args: [Math.max(1, Math.round(people)), base.tenantId, R, M] });
    }
    await batch(st);

    const fresh = (await loadMonth(room.house_id, M)).rooms.find((r) => r.id === R)!;
    if (!(fresh.hasReading || fresh.invoice)) return { ok: true, invoice: null };
    const saved = await saveInvoice(fresh, M, { force: true, houseId: room.house_id });
    return { ok: true, invoice: saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không lưu được" };
  }
}

/** Lưu ghi chú riêng của một phòng trong một tháng (không đụng đến hóa đơn). */
export async function saveRoomNote(roomId: number, month: string, note: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const room = await one<{ id: number }>("SELECT id FROM rooms WHERE id=? AND house_id=?", Number(roomId), h.id);
  if (!room) return { ok: false, error: "Không tìm thấy phòng" };
  const v = String(note ?? "").trim().slice(0, 300);
  if (!v) await run("DELETE FROM room_month WHERE room_id=? AND month=? AND key='note'", room.id, month);
  else await run("INSERT INTO room_month(room_id,month,key,value) VALUES (?,?,'note',?) ON CONFLICT(room_id,month,key) DO UPDATE SET value=excluded.value", room.id, month, v);
  return { ok: true };
}

/* ---------- Ô "Sửa": thông tin cố định của phòng ---------- */
export type RoomProfileInput = {
  roomId: number; month: string;
  code: string; tenantName: string; phone: string; people: string; rent: string; dueDay: string; note: string;
  elecPrice: string; waterPrice: string; elecStart: string; waterStart: string;
  /** Đồng hồ điện phụ: bật, tên, kiểu (add = cộng thêm, sub = trừ đi), số đầu vào */
  auxOn?: boolean; auxName?: string; auxMode?: string; auxStart?: string;
  svc: Record<string, { unit: string; off: boolean }>;
  /** Dịch vụ mới thêm ngay trong ô Sửa (Wifi, Máy giặt + sấy...) */
  newSvc?: { name: string; type: string; price: string; scope: string }[];
};
export async function saveRoomProfile(inp: RoomProfileInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const room = await one<{ id: number; house_id: number }>("SELECT id, house_id FROM rooms WHERE id=?", Number(inp.roomId));
    if (!room) return { ok: false, error: "Không tìm thấy phòng" };
    const code = String(inp.code ?? "").trim().slice(0, 20);
    if (!code) return { ok: false, error: "Nhập số phòng" };
    if (await one("SELECT id FROM rooms WHERE house_id=? AND code=? AND id<>?", room.house_id, code, room.id)) return { ok: false, error: `Phòng ${code} đã có` };
    const name = String(inp.tenantName ?? "").trim().slice(0, 80);
    if (!name) return { ok: false, error: "Nhập tên khách" };
    const n = (v: string) => { const x = toNum(v); return x === null || Number.isNaN(x) ? null : x; };
    const st: { sql: string; args: (string | number | null)[] }[] = [];
    st.push({ sql: "UPDATE rooms SET code=?, rent=?, due_day=?, note=?, elec_start=?, water_start=? WHERE id=?", args: [code, Math.max(0, Math.round(n(inp.rent) ?? 0)), Math.min(31, Math.max(1, Math.round(n(inp.dueDay) ?? 15))), String(inp.note ?? "").slice(0, 200), Math.max(0, n(inp.elecStart) ?? 0), Math.max(0, n(inp.waterStart) ?? 0), room.id] });
    st.push({ sql: "UPDATE tenants SET name=?, phone=?, people=? WHERE room_id=? AND active=1", args: [name, String(inp.phone ?? "").trim().slice(0, 30), Math.max(1, Math.round(n(inp.people) ?? 1)), room.id] });
    const pref = (key: string, value: number | null) => {
      if (value === null) st.push({ sql: "DELETE FROM room_prefs WHERE room_id=? AND key=?", args: [room.id, key] });
      else st.push({ sql: "INSERT INTO room_prefs(room_id,key,value) VALUES (?,?,?) ON CONFLICT(room_id,key) DO UPDATE SET value=excluded.value", args: [room.id, key, String(Math.max(0, Math.round(value)))] });
    };
    pref("elec_price", n(inp.elecPrice));
    pref("water_price", n(inp.waterPrice));
    // Đồng hồ điện phụ của phòng
    const prefText = (key: string, value: string | null) => {
      if (value === null) st.push({ sql: "DELETE FROM room_prefs WHERE room_id=? AND key=?", args: [room.id, key] });
      else st.push({ sql: "INSERT INTO room_prefs(room_id,key,value) VALUES (?,?,?) ON CONFLICT(room_id,key) DO UPDATE SET value=excluded.value", args: [room.id, key, value] });
    };
    if (inp.auxOn) {
      prefText("aux_on", "1");
      prefText("aux_name", String(inp.auxName ?? "").trim().slice(0, 60) || (inp.auxMode === "sub" ? "Điện máy bơm" : "Điện nhà vệ sinh"));
      prefText("aux_mode", inp.auxMode === "sub" ? "sub" : "add");
      const as = n(inp.auxStart ?? "");
      prefText("aux_start", as === null ? null : String(Math.max(0, as)));
    } else {
      for (const k of ["aux_on", "aux_name", "aux_mode", "aux_start"]) prefText(k, null);
    }
    for (const [sid, v] of Object.entries(inp.svc ?? {})) {
      if (!/^\d+$/.test(sid)) continue;
      pref(`svc:${sid}`, n(v.unit));
      if (v.off) st.push({ sql: "INSERT INTO room_prefs(room_id,key,value) VALUES (?,?,'1') ON CONFLICT(room_id,key) DO UPDATE SET value='1'", args: [room.id, `svc_off:${sid}`] });
      else st.push({ sql: "DELETE FROM room_prefs WHERE room_id=? AND key=?", args: [room.id, `svc_off:${sid}`] });
    }
    // Dịch vụ mới (bỏ qua nếu đã có dịch vụ cùng tên trong cùng phạm vi)
    for (const ns of (inp.newSvc ?? []).slice(0, 10)) {
      const sname = String(ns.name ?? "").trim().slice(0, 60);
      if (!sname) continue;
      const price = Math.max(0, Math.round(n(ns.price) ?? 0));
      const type = ns.type === "person" ? "person" : ns.type === "vehicle" ? "vehicle" : "room";
      const scope = ns.scope === "house" ? null : room.id;
      const dup = await one("SELECT id FROM services WHERE house_id=? AND name=? AND COALESCE(room_id,0)=?", room.house_id, sname, scope ?? 0);
      if (dup) return { ok: false, error: `Dịch vụ "${sname}" đã có, hãy sửa giá ở danh sách phía trên` };
      st.push({ sql: "INSERT INTO services(house_id, name, type, price, room_id) VALUES (?,?,?,?,?)", args: [room.house_id, sname, type, price, scope] });
    }
    await batch(st);
    // Tính lại hóa đơn tháng đang xem (nếu đã có) theo thông tin mới
    if (MONTH_RE.test(inp.month) && (await one("SELECT id FROM invoices WHERE room_id=? AND month=?", room.id, inp.month))) await generateInvoice(room.id, inp.month, { force: true });
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không lưu được" };
  }
}

/* ---------- Tạo nhiều phòng ---------- */
/** Tạo phòng nhanh theo tầng: từ tầng A đến tầng B, mỗi tầng N phòng, đánh số 101, 102... theo tầng. Phòng đã có thì bỏ qua. */
export async function createRoomsByFloor(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const from = Math.round(num(f, "from")), to = Math.round(num(f, "to")), per = Math.round(num(f, "per"));
  const rent = Math.max(0, Math.round(num(f, "rent")));
  if (!(from >= 1 && to >= from && to <= 40 && per >= 1 && per <= 40)) back("/rooms", { err: "Nhập đúng: từ tầng (1 trở lên), đến tầng, số phòng mỗi tầng (tối đa 40)" });
  const have = new Set((await all<{ code: string }>("SELECT code FROM rooms WHERE house_id=?", house.id)).map((r) => r.code));
  const st: { sql: string; args: (string | number)[] }[] = [];
  let n = 0;
  for (let fl = from; fl <= to; fl++) {
    for (let i = 1; i <= per; i++) {
      const code = String(fl * 100 + i);
      if (have.has(code)) continue;
      st.push({ sql: "INSERT INTO rooms(house_id, code, rent, due_day) VALUES (?,?,?,15)", args: [house.id, code, rent] });
      n++;
    }
  }
  if (st.length) await batch(st);
  refresh();
  back("/rooms", { ok: n ? `Đã tạo ${n} phòng (tầng ${from} đến ${to}). Vào từng phòng để thêm khách.` : "Các phòng này đã có sẵn, không tạo thêm." });
}

const cleanNum = (v: string) => {
  const t = String(v ?? "").trim().replace(/[đ₫\s]/gi, "");
  if (!t) return 0;
  const n = Number(/^\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, "") : t.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Dán bảng từ Excel (copy các ô rồi dán): cột Phòng | Tên khách | Số điện thoại | Số người | Giá thuê. Dòng tiêu đề tự bỏ qua. */
export async function importRoomsPaste(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const text = str(f, "table");
  if (!text) back("/rooms", { err: "Hãy dán bảng từ Excel vào ô trống" });
  const rows = text.split(/\r?\n/).map((l) => l.split(/\t|;/).map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (rows.length > 300) back("/rooms", { err: "Tối đa 300 dòng mỗi lần" });
  const existing = new Map((await all<{ id: number; code: string }>("SELECT id, code FROM rooms WHERE house_id=?", house.id)).map((r) => [r.code, r.id]));
  let made = 0, updated = 0, tenants = 0, skipped = 0;
  for (const r of rows) {
    const code = (r[0] ?? "").replace(/^(ph[oò]ng)\s*/i, "").trim();
    if (!code || code.length > 20 || /^(ph[oò]ng|s[oố]\s*ph[oò]ng|m[aã])$/i.test(r[0] ?? "")) { skipped++; continue; }
    const name = (r[1] ?? "").slice(0, 80), phone = (r[2] ?? "").replace(/[^\d+]/g, "").slice(0, 20);
    const people = Math.max(1, Math.round(cleanNum(r[3] ?? "")) || 1), rent = Math.max(0, Math.round(cleanNum(r[4] ?? "")));
    let id = existing.get(code);
    if (id === undefined) {
      id = (await run("INSERT INTO rooms(house_id, code, rent, due_day) VALUES (?,?,?,15)", house.id, code, rent)).lastInsertRowid;
      existing.set(code, id);
      made++;
    } else if (rent > 0) {
      await run("UPDATE rooms SET rent=? WHERE id=?", rent, id);
      updated++;
    }
    if (name) {
      const cur = await one<{ id: number }>("SELECT id FROM tenants WHERE room_id=? AND active=1", id);
      if (cur) await run("UPDATE tenants SET name=?, phone=?, people=? WHERE id=?", name, phone, people, cur.id);
      else await run("INSERT INTO tenants(room_id, name, phone, people, move_in) VALUES (?,?,?,?,?)", id, name, phone, people, today());
      tenants++;
    }
  }
  refresh();
  back("/rooms", { ok: `Đã nhập: ${made} phòng mới, ${updated} phòng cập nhật giá, ${tenants} khách thuê${skipped ? `, bỏ qua ${skipped} dòng` : ""}.` });
}

/* ---------- Thu lẻ: thêm một khoản thu vào hóa đơn đã có của phòng ---------- */
export async function addRoomExtra(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const m = str(f, "month");
  const name = str(f, "name").slice(0, 80);
  const amount = Math.round(num(f, "amount"));
  const dest = `/rooms/${roomId}`;
  if (!MONTH_RE.test(m)) back(dest, { err: "Chọn tháng", tab: "history" });
  if (!name || !amount) back(dest, { err: "Nhập tên khoản và số tiền", tab: "history" });
  const inv = await one<{ id: number }>("SELECT id FROM invoices WHERE room_id=? AND month=?", roomId, m);
  if (!inv) back(dest, { err: `Tháng ${m.slice(5)}/${m.slice(0, 4)} chưa có hóa đơn. Hãy tạo hóa đơn ở trang Hóa đơn tháng trước.`, tab: "history" });
  await run("INSERT INTO extras(room_id,month,name,amount) VALUES (?,?,?,?)", roomId, m, name, amount);
  await generateInvoice(roomId, m, { force: true });
  refresh();
  back(dest, { ok: `Đã thêm khoản "${name}" vào hóa đơn tháng ${m.slice(5)}/${m.slice(0, 4)}`, tab: "history" });
}

/* ---------- Sổ thu chi của tháng (hiện dưới bảng Hóa đơn tháng) ---------- */
const catOf = (name: string) => {
  const k = name.toLowerCase();
  return k.includes("lương") || k.includes("luong") ? "luong" : k.includes("đầu tư") || k.includes("dau tu") || k.includes("set up") ? "dau_tu" : "phat_sinh";
};

/** Thay toàn bộ bảng "Chi phí phát sinh" của tháng. */
export async function saveExpenseItems(month: string, items: { name: string; qty: string; unit: string; note?: string }[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const st: { sql: string; args: (string | number)[] }[] = [
    { sql: "DELETE FROM ledger WHERE house_id=? AND month=? AND kind='chi' AND category IN ('phat_sinh','luong','dau_tu')", args: [h.id, month] },
  ];
  for (const it of (items ?? []).slice(0, 60)) {
    const name = String(it.name ?? "").trim().slice(0, 120);
    const qty = toNum(it.qty) ?? 1, unit = toNum(it.unit);
    if (!name || unit === null || Number.isNaN(unit) || Number.isNaN(qty)) continue;
    const amount = Math.round(qty * unit);
    if (!amount) continue;
    st.push({ sql: "INSERT INTO ledger(house_id,month,kind,category,name,amount,source,meta) VALUES (?,?,'chi',?,?,?,'manual',?)", args: [h.id, month, catOf(name), name, amount, JSON.stringify({ qty, unit, note: String(it.note ?? "").trim().slice(0, 200) })] });
    // Khoản đã ghim: cập nhật số tiền mới cho các tháng sau (chỉ khi sửa ở tháng mới nhất đã sửa)
    st.push({ sql: "UPDATE pinned_expenses SET qty=?, unit=?, note=?, last_month=? WHERE house_id=? AND name=? AND ?>=last_month", args: [qty, unit, String(it.note ?? "").trim().slice(0, 200), month, h.id, name, month] });
  }
  await batch(st);
  return { ok: true };
}

/** Thay toàn bộ bảng "Thu tiền phòng mới" của tháng (cọc, tháng đầu của khách mới). */
export async function saveNewRooms(month: string, rows: { room: string; rent: string; people: string; phone: string; total: string; note: string }[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const st: { sql: string; args: (string | number)[] }[] = [
    { sql: "DELETE FROM ledger WHERE house_id=? AND month=? AND kind='thu' AND category='phong_moi'", args: [h.id, month] },
  ];
  for (const r of (rows ?? []).slice(0, 30)) {
    const room = String(r.room ?? "").trim().slice(0, 20);
    const total = toNum(r.total);
    if (!room || total === null || Number.isNaN(total) || !total) continue;
    st.push({
      sql: "INSERT INTO ledger(house_id,month,kind,category,name,amount,source,meta) VALUES (?,?,'thu','phong_moi',?,?,'manual',?)",
      args: [h.id, month, `Phòng ${room}`, Math.round(total), JSON.stringify({ room, rent: toNum(r.rent) ?? 0, people: toNum(r.people) ?? 1, phone: String(r.phone ?? "").slice(0, 20), note: String(r.note ?? "").slice(0, 60) })],
    });
  }
  await batch(st);
  return { ok: true };
}

/** Lưu số tiền chi thực tế từng khoản (điện, nước, mạng, dịch vụ, tiền thuê nhà) của tháng. */
export async function saveChiCategories(month: string, chi: Partial<Record<"dien" | "nuoc" | "mang" | "dich_vu" | "tien_phong", string>>): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const names = { dien: "Tiền điện (trả nhà cung cấp)", nuoc: "Tiền nước (trả nhà cung cấp)", mang: "Tiền mạng", dich_vu: "Dịch vụ (chi thực tế)", tien_phong: "Tiền thuê nhà (trả chủ nhà)" } as const;
  const st: { sql: string; args: (string | number)[] }[] = [];
  for (const k of Object.keys(names) as (keyof typeof names)[]) {
    if (chi[k] === undefined) continue;
    const n = toNum(chi[k]);
    if (n !== null && Number.isNaN(n)) return { ok: false, error: "Số tiền chi phải là số" };
    st.push({ sql: "DELETE FROM ledger WHERE house_id=? AND month=? AND kind='chi' AND category=?", args: [h.id, month, k] });
    // Số âm (hoàn tiền, được trừ) cũng được lưu; chỉ bỏ qua số 0
    if (n && Math.round(n) !== 0) st.push({ sql: "INSERT INTO ledger(house_id,month,kind,category,name,amount,source) VALUES (?,?,'chi',?,?,?,'manual')", args: [h.id, month, k, names[k], Math.round(n)] });
  }
  await batch(st);
  return { ok: true };
}

/* ---------- Nhắc nợ, tạm trú, phương tiện ---------- */
/** Ghi nhật ký khi chủ trọ bấm "Nhắc nợ" (mở Zalo của khách). */
export async function logRemind(roomId: number): Promise<void> {
  await requireAdmin();
  const r = await one<{ house_id: number; code: string }>("SELECT house_id, code FROM rooms WHERE id=?", Number(roomId));
  if (r) await logActivity(r.house_id, "remind", `Đã nhắc nợ phòng ${r.code} qua Zalo`, Number(roomId));
}

export async function toggleResidence(f: FormData) {
  await requireAdmin();
  const id = num(f, "room_id");
  await run("UPDATE tenants SET residence_done=? WHERE room_id=? AND active=1", f.get("done") === "1" ? 1 : 0, id);
  refresh();
  back(str(f, "back").startsWith("/") ? str(f, "back") : "/tenants", {});
}

export async function addVehicle(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  const plate = str(f, "plate").toUpperCase().slice(0, 20);
  const kind = ["Xe máy", "Xe điện", "Xe đạp", "Ô tô"].includes(str(f, "kind")) ? str(f, "kind") : "Xe máy";
  await run("INSERT INTO vehicles(room_id, kind, plate, note) VALUES (?,?,?,?)", roomId, kind, plate, str(f, "note").slice(0, 80));
  refresh();
  back(`/rooms/${roomId}`, { ok: "Đã thêm phương tiện" });
}
export async function deleteVehicle(f: FormData) {
  await requireAdmin();
  const roomId = num(f, "room_id");
  await run("DELETE FROM vehicles WHERE id=? AND room_id=?", num(f, "id"), roomId);
  refresh();
  back(`/rooms/${roomId}`, { ok: "Đã xóa phương tiện" });
}

/* ---------- Sự cố và bảo trì ---------- */
export async function addIssue(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const title = str(f, "title").slice(0, 120);
  if (!title) back("/issues", { err: "Nhập nội dung sự cố" });
  const roomId = num(f, "room_id") || null;
  if (roomId && !(await one("SELECT id FROM rooms WHERE id=? AND house_id=?", roomId, house.id))) back("/issues", { err: "Phòng không thuộc nhà này" });
  await run("INSERT INTO issues(house_id, room_id, title, detail, source, created) VALUES (?,?,?,?,'owner',?)", house.id, roomId, title, str(f, "detail").slice(0, 500), new Date().toISOString());
  await logActivity(house.id, "issue", `Sự cố mới: ${title}`, roomId);
  refresh();
  back("/issues", { ok: "Đã ghi sự cố" });
}
export async function setIssueStatus(f: FormData) {
  await requireAdmin();
  const id = num(f, "id");
  const status = ["open", "doing", "done"].includes(str(f, "status")) ? str(f, "status") : "open";
  const cost = Math.max(0, Math.round(num(f, "cost")));
  const it = await one<{ house_id: number; title: string; room_id: number | null; cost: number; status: string }>("SELECT house_id, title, room_id, cost, status FROM issues WHERE id=?", id);
  if (!it) back("/issues", { err: "Không tìm thấy sự cố" });
  await run("UPDATE issues SET status=?, cost=?, resolved=? WHERE id=?", status, status === "done" ? cost : it!.cost, status === "done" ? new Date().toISOString() : null, id);
  // Xong và có chi phí: ghi luôn vào chi phí phát sinh của tháng này
  if (status === "done" && cost > 0 && it!.status !== "done") {
    const m = today().slice(0, 7);
    await run("INSERT INTO ledger(house_id,month,kind,category,name,amount,source,meta) VALUES (?,?,'chi','phat_sinh',?,?,'manual',?)", it!.house_id, m, `Sửa chữa: ${it!.title}`.slice(0, 120), cost, JSON.stringify({ qty: 1, unit: cost }));
    await logActivity(it!.house_id, "expense", `Chi ${cost.toLocaleString("vi-VN")}đ cho: ${it!.title}`, it!.room_id);
  }
  refresh();
  back("/issues", { ok: status === "done" ? "Đã đánh dấu xong" : "Đã cập nhật" });
}
export async function deleteIssue(f: FormData) {
  await requireAdmin();
  await run("DELETE FROM issues WHERE id=?", num(f, "id"));
  refresh();
  back("/issues", { ok: "Đã xóa" });
}

/** Khách báo sự cố từ trang hóa đơn (không cần đăng nhập, dùng link hóa đơn của chính mình). */
export async function reportIssue(f: FormData) {
  const token = str(f, "token");
  if (!/^[0-9a-f]{24}$/.test(token)) redirect("/login");
  const inv = await one<{ room_id: number; house_id: number; code: string }>("SELECT i.room_id, r.house_id, r.code FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.token=?", token);
  if (!inv) redirect("/login");
  const title = str(f, "title").slice(0, 120);
  const back2 = (p: Record<string, string>) => redirect(`/pay/${token}?${new URLSearchParams(p).toString()}#bao-su-co`);
  if (title.length < 3) back2({ issue: "short" });
  const since = new Date(Date.now() - 86400000).toISOString();
  const n = Number((await one<{ c: number }>("SELECT COUNT(*) c FROM issues WHERE room_id=? AND source='tenant' AND created>?", inv!.room_id, since))?.c ?? 0);
  if (n >= 5) back2({ issue: "limit" });
  await run("INSERT INTO issues(house_id, room_id, title, detail, source, created) VALUES (?,?,?,?,'tenant',?)", inv!.house_id, inv!.room_id, title, str(f, "detail").slice(0, 500), new Date().toISOString());
  await logActivity(inv!.house_id, "issue", `Phòng ${inv!.code} báo sự cố: ${title}`, inv!.room_id);
  back2({ issue: "ok" });
}

/* ---------- Thu chi tự ghi (sổ thu chi) ---------- */
export async function addLedgerEntry(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const m = str(f, "month");
  const name = str(f, "name").slice(0, 120);
  const amount = Math.round(num(f, "amount"));
  const kind = str(f, "kind") === "thu" ? "thu" : "chi";
  const category = ["dien", "nuoc", "mang", "dich_vu", "tien_phong", "phat_sinh", "luong", "dau_tu", "phong_moi"].includes(str(f, "category")) ? str(f, "category") : "phat_sinh";
  if (!MONTH_RE.test(m) || !name || !amount) back("/ledger", { err: "Nhập tháng, nội dung và số tiền" });
  await run("INSERT INTO ledger(house_id,month,kind,category,name,amount,source,meta) VALUES (?,?,?,?,?,?,'manual',?)", house.id, m, kind, category, name, Math.abs(amount), JSON.stringify({ qty: 1, unit: Math.abs(amount) }));
  if (kind === "chi") await logActivity(house.id, "expense", `Chi ${Math.abs(amount).toLocaleString("vi-VN")}đ: ${name}`);
  refresh();
  back("/ledger", { ok: "Đã ghi", year: m.slice(0, 4) });
}
export async function deleteLedgerEntry(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  await run("DELETE FROM ledger WHERE id=? AND house_id=?", num(f, "id"), house.id);
  refresh();
  back("/ledger", { ok: "Đã xóa", year: str(f, "year") });
}

/* ---------- Thêm, đổi tên, xóa phòng linh hoạt ---------- */
const nextCodeInFloor = (codes: string[], floorLabel: string) => {
  const m = floorLabel.match(/^T[aầ]ng\s*(\d+)/i);
  if (m) {
    const base = Number(m[1]) * 100;
    const used = codes.map(Number).filter((n) => Number.isFinite(n) && n > base && n < base + 100);
    return String((used.length ? Math.max(...used) : base) + 1);
  }
  return "";
};

/** Thêm một phòng vào một tầng/khu có sẵn. Để trống tên thì tự đặt số tiếp theo của tầng. */
export async function addRoomToFloor(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const floor = str(f, "floor").slice(0, 40);
  const codes = (await all<{ code: string }>("SELECT code FROM rooms WHERE house_id=?", house.id)).map((r) => r.code);
  const code = (str(f, "code") || nextCodeInFloor(codes, floor)).slice(0, 30);
  if (!code) back("/rooms", { err: `Nhập tên phòng cho "${floor}"` });
  if (codes.includes(code)) back("/rooms", { err: `Phòng "${code}" đã có` });
  const last = await one<{ rent: number }>("SELECT rent FROM rooms WHERE house_id=? ORDER BY id DESC LIMIT 1", house.id);
  await run("INSERT INTO rooms(house_id, code, rent, due_day, floor_label) VALUES (?,?,?,15,?)", house.id, code, last?.rent ?? 0, floor);
  refresh();
  back("/rooms", { ok: `Đã thêm phòng ${code} vào ${floor || "nhà"}` });
}

/** Thêm một tầng/khu mới với tên đặc thù (Tầng trệt, Tầng lửng, Mặt bằng kinh doanh...) và danh sách phòng tự đặt tên. */
export async function createFloor(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const floor = str(f, "floor").slice(0, 40);
  if (!floor) back("/rooms", { err: "Nhập tên tầng hoặc khu" });
  const names = str(f, "names").split(/[\n,;]/).map((s) => s.trim().slice(0, 30)).filter(Boolean);
  const count = Math.min(40, Math.max(0, Math.round(num(f, "count"))));
  const prefix = str(f, "prefix").slice(0, 10);
  const list = names.length ? names : Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
  if (!list.length) back("/rooms", { err: "Nhập tên các phòng (cách nhau bằng dấu phẩy) hoặc số lượng phòng" });
  const have = new Set((await all<{ code: string }>("SELECT code FROM rooms WHERE house_id=?", house.id)).map((r) => r.code));
  const rent = Math.max(0, Math.round(num(f, "rent")));
  const st: { sql: string; args: (string | number)[] }[] = [];
  let skipped = 0;
  for (const code of list) {
    if (have.has(code)) { skipped++; continue; }
    have.add(code);
    st.push({ sql: "INSERT INTO rooms(house_id, code, rent, due_day, floor_label) VALUES (?,?,?,15,?)", args: [house.id, code, rent, floor] });
  }
  if (st.length) await batch(st);
  refresh();
  back("/rooms", st.length ? { ok: `Đã thêm ${st.length} phòng vào "${floor}"${skipped ? `, bỏ qua ${skipped} tên đã có` : ""}` } : { err: "Các tên này đã có hết" });
}

/** Xóa phòng. Phòng đã có hóa đơn chỉ xóa khi chủ trọ tích xác nhận mất cả lịch sử. */
export async function deleteRoom(f: FormData) {
  await requireAdmin();
  const id = num(f, "id");
  const r = await one<{ code: string; house_id: number }>("SELECT code, house_id FROM rooms WHERE id=?", id);
  if (!r) back("/rooms", { err: "Không tìm thấy phòng" });
  const inv = Number((await one<{ c: number }>("SELECT COUNT(*) c FROM invoices WHERE room_id=?", id))?.c ?? 0);
  const pay = Number((await one<{ c: number }>("SELECT COUNT(*) c FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE room_id=?)", id))?.c ?? 0);
  if ((inv > 0 || pay > 0) && f.get("confirm") !== "1") back(`/rooms/${id}`, { err: `Phòng ${r!.code} đã có ${inv} hóa đơn. Tích ô xác nhận mất lịch sử nếu vẫn muốn xóa.` });
  await batch([
    { sql: "DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE room_id=?)", args: [id] },
    { sql: "DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE room_id=?)", args: [id] },
    { sql: "DELETE FROM invoices WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM readings WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM extras WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM room_month WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM room_prefs WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM vehicles WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM room_files WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM contract_events WHERE contract_id IN (SELECT id FROM contracts WHERE room_id=?)", args: [id] },
    { sql: "DELETE FROM contracts WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM tenants WHERE room_id=?", args: [id] },
    { sql: "UPDATE issues SET room_id=NULL WHERE room_id=?", args: [id] },
    { sql: "UPDATE activity SET room_id=NULL WHERE room_id=?", args: [id] },
    { sql: "DELETE FROM rooms WHERE id=?", args: [id] },
  ]);
  refresh();
  back("/rooms", { ok: `Đã xóa phòng ${r!.code}` });
}

/** Thêm một khoản dịch vụ/phí (wifi, máy giặt, gửi xe...) cho riêng một phòng hoặc cho tất cả phòng trong nhà. */
export async function addRoomService(f: FormData) {
  await requireAdmin();
  const house = await currentHouse();
  const roomId = num(f, "room_id");
  const name = str(f, "name").slice(0, 60);
  const type = str(f, "type") === "person" ? "person" : str(f, "type") === "vehicle" ? "vehicle" : "room";
  const price = Math.max(0, Math.round(num(f, "price")));
  const dest = `/rooms/${roomId}`;
  if (!name) back(dest, { err: "Nhập tên khoản phí", tab: "price" });
  if (!(await one("SELECT id FROM rooms WHERE id=? AND house_id=?", roomId, house.id))) back("/rooms", { err: "Không tìm thấy phòng" });
  const scope = str(f, "scope") === "house" ? null : roomId;
  await run("INSERT INTO services(house_id, name, type, price, room_id) VALUES (?,?,?,?,?)", house.id, name, type, price, scope);
  refresh();
  back(dest, { ok: scope ? `Đã thêm "${name}" cho phòng này` : `Đã thêm "${name}" cho tất cả phòng trong nhà`, tab: "price" });
}

/** Ghim một khoản chi hằng tháng: từ tháng sau trở đi, khoản này tự có sẵn trong bảng Chi phí phát sinh. */
export async function pinExpense(month: string, item: { name: string; qty: string; unit: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const name = String(item.name ?? "").trim().slice(0, 120);
  const qty = toNum(item.qty) ?? 1, unit = toNum(item.unit);
  if (!name) return { ok: false, error: "Nhập tên khoản trước khi ghim" };
  if (unit === null || Number.isNaN(unit) || Number.isNaN(qty)) return { ok: false, error: "Nhập đơn giá trước khi ghim" };
  await batch([
    { sql: "INSERT INTO pinned_expenses(house_id,name,category,qty,unit,note,from_month,last_month) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(house_id,name) DO UPDATE SET qty=excluded.qty, unit=excluded.unit, note=excluded.note, category=excluded.category, from_month=excluded.from_month, last_month=excluded.last_month", args: [h.id, name, catOf(name), qty, Math.round(unit), String(item.note ?? "").trim().slice(0, 200), month, month] },
    // Tháng đang ghim đã có khoản này rồi, không thêm lần nữa
    { sql: "INSERT OR IGNORE INTO ledger_init(house_id, month) VALUES (?,?)", args: [h.id, month] },
  ]);
  return { ok: true };
}

export async function unpinExpense(name: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const h = await currentHouse();
  await run("DELETE FROM pinned_expenses WHERE house_id=? AND name=?", h.id, String(name ?? "").trim());
  return { ok: true };
}

/* ---------- Danh sách người ở (từng người trong phòng) ---------- */
export type ResidentRow = {
  room: string; name: string; cccd: string; gender: string; dob: string; phone: string;
  job: string; address: string; plate: string; vehicle: string; emergency: string;
};
/** Lưu toàn bộ danh sách người ở của nhà đang chọn (thay thế danh sách cũ, trong một lượt ghi). */
export async function saveResidents(rows: ResidentRow[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!Array.isArray(rows) || rows.length > 400) return { ok: false, error: "Tối đa 400 người mỗi nhà" };
  const h = await currentHouse();
  const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const st: { sql: string; args: (string | number)[] }[] = [{ sql: "DELETE FROM residents WHERE house_id=?", args: [h.id] }];
  rows.forEach((r, i) => {
    const row = [t(r.room, 30), t(r.name, 80), t(r.cccd, 20), r.gender === "Nam" || r.gender === "Nữ" ? r.gender : "", t(r.dob, 20), t(r.phone, 20), t(r.job, 60), t(r.address, 200), t(r.plate, 30), t(r.vehicle, 60), t(r.emergency, 80)];
    if (row.every((x) => x === "")) return; // bỏ dòng trống
    st.push({ sql: "INSERT INTO residents(house_id, sort, room_code, name, cccd, gender, dob, phone, job, address, plate, vehicle, emergency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", args: [h.id, i, ...row] });
  });
  await batch(st);
  return { ok: true };
}

/**
 * Đổi nhanh trạng thái một hóa đơn trong Danh sách hóa đơn:
 * - "paid": ghi nhận thu nốt phần còn lại.
 * - "unpaid" / "overdue": xóa các khoản đã thu của hóa đơn rồi đặt trạng thái Chưa thu hoặc Quá hạn.
 * Trạng thái mới được dùng ở mọi nơi (Hóa đơn tháng, Tổng quan, Sơ đồ phòng, trang khách xem).
 */
export async function setInvoiceStatus(invoiceId: number, target: "paid" | "unpaid" | "overdue"): Promise<{ ok: boolean; error?: string; status?: string }> {
  await requireAdmin();
  const h = await currentHouse();
  const inv = await one<{ id: number; total: number; room_id: number; month: string; code: string }>(
    "SELECT i.id, i.total, i.room_id, i.month, r.code FROM invoices i JOIN rooms r ON r.id=i.room_id WHERE i.id=? AND r.house_id=?", Number(invoiceId), h.id
  );
  if (!inv) return { ok: false, error: "Không tìm thấy hóa đơn" };
  const paid = Number((await one<{ p: number }>("SELECT COALESCE(SUM(amount),0) p FROM payments WHERE invoice_id=?", inv.id))?.p ?? 0);
  if (target === "paid") {
    const remain = inv.total - paid;
    const st: { sql: string; args: (string | number)[] }[] = [];
    if (remain > 0) st.push({ sql: "INSERT INTO payments(invoice_id,amount,method,paid_at,note) VALUES (?,?,?,?,?)", args: [inv.id, remain, "bank", today(), "Cập nhật nhanh: đã thu"] });
    st.push({ sql: "UPDATE invoices SET state='' WHERE id=?", args: [inv.id] });
    await batch(st);
    await logActivity(h.id, "payment", `Phòng ${inv.code} đã thu đủ hóa đơn T${inv.month.slice(5)} (cập nhật nhanh)`, inv.room_id);
  } else if (target === "unpaid" || target === "overdue") {
    await batch([
      { sql: "DELETE FROM payments WHERE invoice_id=?", args: [inv.id] },
      { sql: "UPDATE invoices SET state=? WHERE id=?", args: [target, inv.id] },
    ]);
  } else return { ok: false, error: "Trạng thái không hợp lệ" };
  refresh();
  return { ok: true, status: target };
}

/* ---------- Giấy tờ của phòng: ảnh CCCD, hợp đồng ---------- */
const FILE_KINDS = ["cccd", "contract", "other"];
const FILE_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_FILES_PER_ROOM = 40;

/** Lưu một ảnh/PDF (đã nén ở trình duyệt, gửi dạng base64) vào hồ sơ phòng, gắn với khách đang ở. */
export async function uploadRoomFile(inp: { roomId: number; kind: string; name: string; mime: string; data: string }): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const h = await currentHouse();
  const room = await one<{ id: number }>("SELECT id FROM rooms WHERE id=? AND house_id=?", Number(inp.roomId), h.id);
  if (!room) return { ok: false, error: "Không tìm thấy phòng" };
  const kind = FILE_KINDS.includes(inp.kind) ? inp.kind : "other";
  if (!FILE_MIME.includes(inp.mime)) return { ok: false, error: "Chỉ nhận ảnh (JPG, PNG, WebP) hoặc file PDF" };
  const data = String(inp.data ?? "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 20) return { ok: false, error: "File không hợp lệ" };
  const size = Math.floor((data.length * 3) / 4);
  if (size > MAX_FILE_BYTES) return { ok: false, error: `File quá lớn (tối đa ${MAX_FILE_BYTES / 1024 / 1024}MB)` };
  const cnt = Number((await one<{ c: number }>("SELECT COUNT(*) c FROM room_files WHERE room_id=?", room.id))?.c ?? 0);
  if (cnt >= MAX_FILES_PER_ROOM) return { ok: false, error: `Mỗi phòng tối đa ${MAX_FILES_PER_ROOM} file, hãy xóa bớt file cũ` };
  const tenant = await one<{ id: number }>("SELECT id FROM tenants WHERE room_id=? AND active=1", room.id);
  const name = String(inp.name ?? "").replace(/[\r\n]/g, " ").slice(0, 120) || "file";
  await run("INSERT INTO room_files(room_id, tenant_id, kind, name, mime, size, data, created) VALUES (?,?,?,?,?,?,?,?)", room.id, tenant?.id ?? null, kind, name, inp.mime, size, data, new Date().toISOString());
  refresh();
  return { ok: true };
}

export async function deleteRoomFile(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const h = await currentHouse();
  await run("DELETE FROM room_files WHERE id=? AND room_id IN (SELECT id FROM rooms WHERE house_id=?)", Number(id), h.id);
  refresh();
  return { ok: true };
}

/** Bảng thanh toán với chủ nhà: bật/tắt, các phòng lấy tiền điện, các phòng lấy tiền nước, tên chủ nhà (hiện trên bill). Tạo mã link bill nếu chưa có. */
export async function saveLandlordSettings(inp: { enabled: boolean; elecRoomIds: number[]; waterRoomIds: number[]; name: string }): Promise<{ ok: boolean; error?: string; token?: string }> {
  await requireAdmin();
  const h = await currentHouse();
  const mine = new Set((await all<{ id: number }>("SELECT id FROM rooms WHERE house_id=?", h.id)).map((r) => r.id));
  const pick = (a: number[]) => [...new Set((a ?? []).map(Number))].filter((n) => mine.has(n));
  const up = "INSERT INTO house_settings(house_id,key,value) VALUES (?,?,?) ON CONFLICT(house_id,key) DO UPDATE SET value=excluded.value";
  const existing = await one<{ value: string }>("SELECT value FROM house_settings WHERE house_id=? AND key='landlord_bill_token'", h.id);
  const token = existing?.value || crypto.randomBytes(12).toString("hex");
  await batch([
    { sql: up, args: [h.id, "landlord_table", inp.enabled ? "1" : "0"] },
    { sql: up, args: [h.id, "landlord_elec_room", pick(inp.elecRoomIds).join(",")] },
    { sql: up, args: [h.id, "landlord_water_room", pick(inp.waterRoomIds).join(",")] },
    { sql: up, args: [h.id, "landlord_name", String(inp.name ?? "").trim().slice(0, 80)] },
    { sql: up, args: [h.id, "landlord_bill_token", token] },
  ]);
  refresh();
  return { ok: true, token };
}

/** Chi phí phát sinh (nội dung - số tiền) tự điền của tháng trong bảng thanh toán với chủ nhà. */
export async function saveLandlordExtras(month: string, rows: { name: string; amount: string }[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const clean = (rows ?? []).slice(0, 30).map((r) => ({ name: String(r.name ?? "").trim().slice(0, 120), amount: String(r.amount ?? "").replace(/[^\d-]/g, "") }))
    .filter((r) => r.name || (r.amount && r.amount !== "-"));
  await run("INSERT INTO house_settings(house_id,key,value) VALUES (?,?,?) ON CONFLICT(house_id,key) DO UPDATE SET value=excluded.value", h.id, `landlord_extra:${month}`, JSON.stringify(clean));
  return { ok: true };
}

/**
 * Đặt kỳ thu của MỌI phòng trong tháng theo "ngày đóng tiền" của từng phòng (ô Sửa phòng):
 * Từ = ngày đó của tháng, Đến = đúng 1 tháng sau. Hóa đơn nhập từ sheet (đã khóa) chỉ đổi ngày, giữ nguyên số tiền.
 */
export async function applyDueDayToMonth(month: string): Promise<{ ok: boolean; error?: string; n?: number }> {
  await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, error: "Tháng không hợp lệ" };
  const h = await currentHouse();
  const rooms = await all<{ id: number; due_day: number }>("SELECT id, due_day FROM rooms WHERE house_id=?", h.id);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const st: { sql: string; args: (string | number)[] }[] = [];
  const up = "INSERT INTO room_month(room_id,month,key,value) VALUES (?,?,?,?) ON CONFLICT(room_id,month,key) DO UPDATE SET value=excluded.value";
  for (const r of rooms) {
    const day = Math.min(Math.max(Math.round(r.due_day) || 15, 1), lastDay);
    const start = `${month}-${String(day).padStart(2, "0")}`;
    const end = addMonths(start, 1);
    st.push({ sql: up, args: [r.id, month, "p_start", start] }, { sql: up, args: [r.id, month, "p_end", end] });
    st.push({ sql: "UPDATE invoices SET period_start=?, due_date=? WHERE room_id=? AND month=?", args: [start, end, r.id, month] });
  }
  for (let i = 0; i < st.length; i += 400) await batch(st.slice(i, i + 400));
  await generateMonth(h.id, month); // tính lại các hóa đơn chưa khóa để dòng "Kỳ ..." khớp ngày mới
  refresh();
  return { ok: true, n: rooms.length };
}
