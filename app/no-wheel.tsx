"use client";

import { useEffect } from "react";

/** Chặn lăn chuột làm đổi số trong ô số (đưa chuột qua ô đang chọn rất dễ nhảy nhầm số). */
export function NoWheel() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "number" && document.activeElement === t) t.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
