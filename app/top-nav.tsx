"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAIN = [
  { href: "/overview", label: "Tổng quan", on: "bg-sky-100 text-sky-900", dot: "bg-sky-500" },
  { href: "/rooms", label: "Phòng", on: "bg-orange-100 text-orange-900", dot: "bg-orange-500" },
  { href: "/tenants", label: "Khách thuê", on: "bg-rose-100 text-rose-900", dot: "bg-rose-500" },
  { href: "/", label: "Hóa đơn tháng", on: "bg-brand-100 text-brand-900", dot: "bg-brand-600" },
  { href: "/history", label: "Lịch sử thu", on: "bg-teal-100 text-teal-900", dot: "bg-teal-500" },
  { href: "/reports", label: "Báo cáo", on: "bg-violet-100 text-violet-900", dot: "bg-violet-500" },
  { href: "/settings", label: "Cài đặt", on: "bg-slate-200 text-slate-900", dot: "bg-slate-500" },
];
const MORE = [
  { href: "/search", label: "Tìm kiếm nâng cao" },
  { href: "/issues", label: "Sự cố và bảo trì" },
  { href: "/ledger", label: "Sổ thu chi" },
  { href: "/invoices", label: "Danh sách hóa đơn" },
  { href: "/readings", label: "Bảng điện nước" },
  { href: "/import", label: "Nhập dữ liệu sheet" },
  { href: "/account", label: "Đổi mật khẩu" },
];

/** Thanh tab trên máy tính: tab đang mở được tô màu riêng để dễ nhận biết. */
export function TopNav({ badge }: { badge: number }) {
  const path = usePathname();
  const on = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`));
  const moreActive = MORE.some((m) => on(m.href));
  // Menu "Khác" tự thu lại: khi bấm ra ngoài, bấm phím Esc, hoặc sau khi chọn một mục (chuyển trang).
  // Lưu "mở ở trang nào": sang trang khác thì tự coi như đã đóng.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean | ((x: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === "function" ? v(cur === path) : v) ? path : null));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpenAt(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenAt(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <nav className="hidden flex-wrap items-center gap-1 text-sm md:flex" aria-label="Menu chính">
      {MAIN.map((n) => {
        const active = on(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={`relative rounded-lg px-2.5 py-1.5 ${active ? `${n.on} font-semibold shadow-sm` : "text-gray-700 hover:bg-gray-100"}`}>
            {n.label}
            {active && <span className={`absolute inset-x-2.5 -bottom-1 h-0.5 rounded-full ${n.dot}`} />}
            {n.href === "/settings" && badge > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-500" />}
          </Link>
        );
      })}
      <div ref={box} className="relative">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
          className={`cursor-pointer rounded-lg px-2.5 py-1.5 ${moreActive || open ? "bg-amber-100 font-semibold text-amber-900 shadow-sm" : "text-gray-700 hover:bg-gray-100"}`}>
          Khác ▾
        </button>
        {open && (
          <div role="menu" className="absolute z-10 mt-1 w-52 rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
            {MORE.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`block px-3 py-2 ${on(n.href) ? "bg-amber-50 font-semibold text-amber-900" : "text-gray-700 hover:bg-brand-50"}`}>{n.label}</Link>
            ))}
            <a href="/export" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-700 hover:bg-brand-50">Tải file CSV</a>
          </div>
        )}
      </div>
    </nav>
  );
}
