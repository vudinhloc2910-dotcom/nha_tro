import { all, run } from "./db";

export type ActKind = "payment" | "invoice" | "checkin" | "checkout" | "remind" | "expense" | "issue";
export type Act = { id: number; house_id: number; house: string; room_id: number | null; kind: ActKind; text: string; ts: string };

/** Ghi một dòng vào nhật ký hoạt động. Lỗi ghi nhật ký không được làm hỏng việc chính. */
export async function logActivity(houseId: number, kind: ActKind, text: string, roomId?: number | null) {
  try {
    await run("INSERT INTO activity(house_id, room_id, kind, text, ts) VALUES (?,?,?,?,?)", houseId, roomId ?? null, kind, text.slice(0, 200), new Date().toISOString());
  } catch { /* bỏ qua */ }
}

export async function recentActivity(limit = 20): Promise<Act[]> {
  return all<Act>(
    `SELECT a.id, a.house_id, h.name house, a.room_id, a.kind, a.text, a.ts
     FROM activity a JOIN houses h ON h.id=a.house_id ORDER BY a.id DESC LIMIT ?`, limit
  );
}

/** "2 phút trước", "3 giờ trước", "hôm qua"... */
export function ago(ts: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(ts)) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "hôm qua" : `${d} ngày trước`;
}
