"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICON = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5",
  rooms: "M5 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M15 9h3a1 1 0 0 1 1 1v10M3 20h18M8.5 8h3M8.5 12h3M8.5 16h3",
  bill: "M7 3h8l4 4v14H7zM14 3v5h5M10 12h6M10 16h6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

const TABS = [
  { href: "/overview", label: "Tổng quan", icon: ICON.home, on: "text-sky-600", dot: "bg-sky-500" },
  { href: "/rooms", label: "Phòng", icon: ICON.rooms, on: "text-teal-600", dot: "bg-teal-500" },
  { href: "/", label: "Hóa đơn", icon: ICON.bill, main: true, on: "text-brand-700", dot: "bg-brand-600" },
  { href: "/reports", label: "Báo cáo", icon: ICON.chart, on: "text-violet-600", dot: "bg-violet-500" },
];
const MORE = [
  { href: "/history", label: "Lịch sử thu tiền" },
  { href: "/invoices", label: "Danh sách hóa đơn" },
  { href: "/readings", label: "Bảng điện nước" },
  { href: "/settings", label: "Cài đặt" },
  { href: "/import", label: "Nhập dữ liệu sheet" },
];

/** Thanh nút dưới cùng (chỉ hiện trên điện thoại) kèm bảng "Khác" trượt lên. */
export function BottomNav({ logout, badge }: { logout: () => Promise<void>; badge: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const moreActive = MORE.some((m) => path.startsWith(m.href));

  return (
    <div className="no-print md:hidden">
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-4 pb-24 pt-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300" />
            <h2 className="mb-2 px-1 text-lg font-bold">Tiện ích</h2>
            <ul className="divide-y divide-gray-100">
              {MORE.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} onClick={() => setOpen(false)} className="flex items-center justify-between px-1 py-3.5 text-base text-gray-900">
                    <span>{m.label}</span>
                    {m.href === "/settings" && badge > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{badge} việc cần làm</span>}
                    <span className="text-gray-400">›</span>
                  </Link>
                </li>
              ))}
              <li><a href="/export" className="flex items-center justify-between px-1 py-3.5 text-base text-gray-900"><span>Tải file CSV</span><span className="text-gray-400">›</span></a></li>
              <li>
                <form action={logout}><button className="w-full px-1 py-3.5 text-left text-base text-red-700">Đăng xuất</button></form>
              </li>
            </ul>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} onClick={() => setOpen(false)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${on(t.href) && !open ? t.on : "text-gray-500"}`}>
                <span className={t.main ? `-mt-5 rounded-full p-3 text-white shadow-lg ${on(t.href) && !open ? "bg-brand-700" : "bg-brand-600"}` : ""}><I d={t.icon} /></span>
                <span>{t.label}</span>
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setOpen((v) => !v)} className={`relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${open || moreActive ? "text-amber-600" : "text-gray-500"}`}>
              <I d={ICON.more} />
              <span>Khác</span>
              {badge > 0 && <span className="absolute right-5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500" />}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
