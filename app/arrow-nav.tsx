"use client";

import { useEffect } from "react";

const FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]), ';
const SELECTOR = FIELD.slice(0, -2);

type Dir = "up" | "down" | "left" | "right";
const KEY: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

const usable = (el: HTMLInputElement) => {
  if (el.disabled || el.readOnly || el.tabIndex < 0) return false;
  if (el.closest("details:not([open])")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

/** Có nên nhảy ô không? Ô số: luôn nhảy. Ô chữ: chỉ khi con trỏ đã ở mép (đầu/cuối). Ô ngày và ô chọn: không nhảy. */
function shouldMove(el: HTMLInputElement, dir: Dir) {
  if (el.type === "date" || el.type === "month" || el.type === "time") return false;
  if (dir === "up" || dir === "down") return true;
  if (el.type === "number") return true;
  const a = el.selectionStart, b = el.selectionEnd;
  if (a === null || b === null) return true;
  if (a !== b && a === 0 && b === el.value.length) return true; // đang bôi đen cả ô
  return dir === "left" ? a === 0 && b === 0 : a === el.value.length && b === el.value.length;
}

/** Tìm ô gần nhất theo hướng mũi tên (theo vị trí thật trên màn hình, nên đúng cả với bảng lẫn biểu mẫu nhiều cột). */
function findNext(cur: HTMLInputElement, dir: Dir): HTMLInputElement | null {
  const scope = cur.closest("[data-nav-scope]") ?? cur.closest("form") ?? document.querySelector("main") ?? document.body;
  const r0 = cur.getBoundingClientRect();
  const cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;
  let best: HTMLInputElement | null = null;
  let bestScore = Infinity;
  for (const c of Array.from(scope.querySelectorAll<HTMLInputElement>(SELECTOR))) {
    if (c === cur || !usable(c)) continue;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = cx - cx0, dy = cy - cy0;
    const overlapX = Math.min(r.right, r0.right) - Math.max(r.left, r0.left);
    const overlapY = Math.min(r.bottom, r0.bottom) - Math.max(r.top, r0.top);
    let score: number;
    if (dir === "down" || dir === "up") {
      if ((dir === "down" ? dy : -dy) < Math.min(r0.height, r.height) * 0.6) continue;
      if (overlapX <= 0) continue; // phải cùng cột
      score = Math.abs(dy) + Math.abs(dx) * 0.2;
    } else {
      if ((dir === "right" ? dx : -dx) < Math.min(r0.width, r.width) * 0.3) continue;
      if (overlapY < Math.min(r0.height, r.height) * 0.4) continue; // phải cùng hàng
      score = Math.abs(dx) + Math.abs(dy) * 3;
    }
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Dùng phím mũi tên trên/dưới/trái/phải để nhảy giữa các ô nhập (bảng và biểu mẫu), không cần dùng chuột. */
export function ArrowNav() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY[e.key];
      if (!dir || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !t.matches(SELECTOR)) return;
      // Ô số: mũi tên không bao giờ làm đổi giá trị
      const isNumber = t.type === "number";
      if (!shouldMove(t, dir)) return;
      const next = findNext(t, dir);
      if (isNumber || next) e.preventDefault();
      if (!next) return;
      next.focus();
      if (next.type !== "date" && next.type !== "month") next.select?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
