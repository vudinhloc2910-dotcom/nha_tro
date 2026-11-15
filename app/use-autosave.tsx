"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type SaveResult = { ok: boolean; error?: string };

/**
 * Tự lưu: lưu ngay khi rời ô (gọi flush), tự lưu sau 1,2 giây khi ngừng gõ, lưu nốt khi chuyển sang trang khác,
 * và báo trạng thái "Chưa lưu / Đang lưu / Đã lưu". Không làm tải lại trang nên đang gõ không bị mất vị trí.
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<SaveResult>, onStatus: (s: string) => void) {
  const snap = useRef(JSON.stringify(value));
  const latest = useRef(value);
  const saveRef = useRef(save);
  const statusRef = useRef(onStatus);
  // Cập nhật giá trị mới nhất sau mỗi lần hiển thị (không cập nhật trong lúc hiển thị)
  useEffect(() => { latest.current = value; saveRef.current = save; statusRef.current = onStatus; });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (busy.current) return;
    const cur = JSON.stringify(latest.current);
    if (cur === snap.current) return;
    busy.current = true;
    statusRef.current("Đang lưu…");
    let r: SaveResult;
    try { r = await saveRef.current(latest.current); } catch { r = { ok: false, error: "Mất kết nối" }; }
    busy.current = false;
    if (r.ok) {
      snap.current = cur;
      statusRef.current("Đã lưu ✓");
      if (JSON.stringify(latest.current) !== snap.current) void flushRef.current(); // trong lúc lưu lại có sửa tiếp
    } else {
      statusRef.current(`Lỗi: ${r.error ?? "không lưu được"}. Bấm "Lưu ngay" để thử lại`);
    }
  }, []);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  useEffect(() => {
    if (JSON.stringify(value) !== snap.current) {
      statusRef.current("Chưa lưu…");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1200);
    }
  }, [value, flush]);

  // Chuyển sang trang khác: lưu nốt phần đang dở
  useEffect(() => () => { clearTimeout(timer.current); void flush(); }, [flush]);

  return useMemo(() => ({ flush: () => void flush(), dirty: () => JSON.stringify(latest.current) !== snap.current }), [flush]);
}

export function StatusText({ t }: { t?: string }) {
  if (!t) return null;
  const cls = t.startsWith("Lỗi") ? "text-red-700" : t.startsWith("Chưa") || t.startsWith("Đang") ? "text-amber-700" : "text-green-700";
  return <span className={`text-sm ${cls}`}>{t}</span>;
}

