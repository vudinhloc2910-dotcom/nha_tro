import { all, one } from "./db";

export type Todo = { id: string; label: string; hint: string; href: string; done: boolean };

/** "Việc cần làm" để một nhà sẵn sàng thu tiền (giống bước "Việc đầu tiên" của các app quản lý nhà trọ). */
export async function houseTodos(houseId: number): Promise<Todo[]> {
  const rooms = Number((await one<{ c: number }>("SELECT COUNT(*) c FROM rooms WHERE house_id=?", houseId))?.c ?? 0);
  const tenants = Number((await one<{ c: number }>(
    "SELECT COUNT(*) c FROM tenants t JOIN rooms r ON r.id=t.room_id WHERE r.house_id=? AND t.active=1", houseId))?.c ?? 0);
  const kv = new Map((await all<{ key: string; value: string }>("SELECT key, value FROM house_settings WHERE house_id=?", houseId)).map((r) => [r.key, r.value]));
  return [
    { id: "rooms", label: "Thêm phòng", hint: "Tạo danh sách phòng của nhà", href: "/rooms", done: rooms > 0 },
    { id: "tenants", label: "Thêm khách thuê và giá phòng", hint: "Tên khách, số người, giá thuê từng phòng", href: "/rooms", done: tenants > 0 },
    { id: "prices", label: "Đặt giá điện, nước, dịch vụ", hint: "Dùng để tự tính hóa đơn", href: "/settings", done: kv.has("elec_price") && kv.has("water_price") },
    { id: "bank", label: "Nhập tài khoản nhận tiền", hint: "Để khách quét QR chuyển khoản đúng nơi", href: "/settings", done: !!kv.get("bank_account") },
    { id: "contact", label: "Nhập số điện thoại chủ trọ", hint: "Hiện trên hóa đơn gửi khách", href: "/settings", done: !!kv.get("house_phone") },
  ];
}
