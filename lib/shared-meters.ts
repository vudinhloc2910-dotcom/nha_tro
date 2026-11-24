/**
 * Đồng hồ điện CHUNG của cả nhà (VD nhà vệ sinh dùng chung một tầng).
 * Cấu hình lưu ở house_settings.shared_meters (JSON); số đồng hồ từng tháng lưu ở house_settings:
 *   sm:<id>:<YYYY-MM>  = số mới của tháng
 *   smo:<id>:<YYYY-MM> = số cũ đặt tay (không có thì lấy số mới của tháng gần nhất trước đó, chưa có thì số đầu vào)
 * Hàm thuần, dùng chung ở máy chủ và trình duyệt.
 */
export type SharedMeterCfg = { id: string; name: string; start: number; rooms: { roomId: number; parts: number }[] };

const ID_RE = /^[a-z0-9_]{1,20}$/;

export function parseSharedMeters(raw: string | undefined): SharedMeterCfg[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: SharedMeterCfg[] = [];
    for (const m of arr.slice(0, 12)) {
      const id = String(m?.id ?? "");
      if (!ID_RE.test(id)) continue;
      const rooms = (Array.isArray(m.rooms) ? m.rooms : [])
        .map((r: { roomId?: unknown; parts?: unknown }) => ({ roomId: Number(r.roomId), parts: Number(r.parts) }))
        .filter((r: { roomId: number; parts: number }) => Number.isInteger(r.roomId) && r.roomId > 0 && Number.isFinite(r.parts) && r.parts > 0)
        .slice(0, 40);
      out.push({ id, name: String(m.name ?? "Điện nhà vệ sinh").slice(0, 60), start: Number.isFinite(Number(m.start)) ? Math.max(0, Number(m.start)) : 0, rooms });
    }
    return out;
  } catch {
    return [];
  }
}

const num = (v: string | undefined) => (v === undefined || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Số mới của một tháng (null = chưa nhập). */
export const sharedNew = (settings: Record<string, string>, id: string, month: string) => num(settings[`sm:${id}:${month}`]);

/** Số cũ của một tháng: số đặt tay, hoặc số mới của tháng gần nhất đã nhập trước đó, hoặc số đầu vào. */
export function sharedOldAuto(settings: Record<string, string>, m: SharedMeterCfg, month: string): number {
  const prefix = `sm:${m.id}:`;
  let best = "";
  for (const k of Object.keys(settings)) {
    if (!k.startsWith(prefix)) continue;
    const mo = k.slice(prefix.length);
    if (mo < month && mo > best && num(settings[k]) !== null) best = mo;
  }
  return best ? (num(settings[prefix + best]) as number) : m.start;
}
export const sharedOld = (settings: Record<string, string>, m: SharedMeterCfg, month: string) => num(settings[`smo:${m.id}:${month}`]) ?? sharedOldAuto(settings, m, month);
