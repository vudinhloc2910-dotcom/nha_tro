import { cache } from "react";
import { readAll } from "./db";

export type Todo = { id: string; label: string; hint: string; href: string; done: boolean };

/** "Việc cần làm" để một nhà sẵn sàng thu tiền. Cache theo yêu cầu: layout và trang cùng gọi vẫn chỉ truy vấn 1 lần. */
export const houseTodos = cache(async (houseId: number): Promise<Todo[]> => {
  const [r, t, k] = await readAll([
    { sql: "SELECT COUNT(*) c FROM rooms WHERE house_id=?", args: [houseId] },
    { sql: "SELECT COUNT(*) c FROM tenants t JOIN rooms r ON r.id=t.room_id WHERE r.house_id=? AND t.active=1", args: [houseId] },
    { sql: "SELECT key, value FROM house_settings WHERE house_id=?", args: [houseId] },
  ]);
  const rooms = Number((r[0] as { c: number }).c), tenants = Number((t[0] as { c: number }).c);
  const kv = new Map((k as { key: string; value: string }[]).map((x) => [x.key, x.value]));
  return [
    { id: "rooms", label: "Thêm phòng", hint: "Tạo danh sách phòng của nhà", href: "/rooms", done: rooms > 0 },
    { id: "tenants", label: "Thêm khách thuê và giá phòng", hint: "Tên khách, số người, giá thuê từng phòng", href: "/rooms", done: tenants > 0 },
    { id: "prices", label: "Đặt giá điện, nước, dịch vụ", hint: "Dùng để tự tính hóa đơn", href: "/settings", done: kv.has("elec_price") && kv.has("water_price") },
    { id: "bank", label: "Nhập tài khoản nhận tiền", hint: "Để khách quét QR chuyển khoản đúng nơi", href: "/settings", done: !!kv.get("bank_account") },
    { id: "contact", label: "Nhập số điện thoại chủ trọ", hint: "Hiện trên hóa đơn gửi khách", href: "/settings", done: !!kv.get("house_phone") },
  ];
});
