import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";
import { listHouses } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { houseTodos } from "@/lib/todos";
import { HouseSwitcher } from "../house-switcher";
import { BottomNav } from "../bottom-nav";

const MAIN = [
  { href: "/overview", label: "Tổng quan" },
  { href: "/", label: "Hóa đơn tháng" },
  { href: "/history", label: "Lịch sử thu" },
  { href: "/reports", label: "Báo cáo" },
  { href: "/rooms", label: "Phòng" },
  { href: "/settings", label: "Cài đặt" },
];
const MORE = [
  { href: "/invoices", label: "Danh sách hóa đơn" },
  { href: "/readings", label: "Bảng điện nước" },
  { href: "/import", label: "Nhập dữ liệu sheet" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const houses = await listHouses();
  const house = await currentHouse();
  const todos = await houseTodos(house.id);
  const badge = todos.filter((t) => !t.done).length;
  return (
    <div>
      <header className="no-print sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <HouseSwitcher houses={houses} currentId={house.id} />
          <nav className="hidden flex-wrap items-center gap-1 text-sm md:flex">
            {MAIN.map((n) => (
              <Link key={n.href} href={n.href} className="relative rounded-lg px-2.5 py-1.5 text-gray-700 hover:bg-brand-50">
                {n.label}
                {n.href === "/settings" && badge > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-500" />}
              </Link>
            ))}
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg px-2.5 py-1.5 text-gray-700 hover:bg-brand-50">Khác ▾</summary>
              <div className="absolute z-10 mt-1 w-52 rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                {MORE.map((n) => (
                  <Link key={n.href} href={n.href} className="block px-3 py-2 text-gray-700 hover:bg-brand-50">{n.label}</Link>
                ))}
                <a href="/export" className="block px-3 py-2 text-gray-700 hover:bg-brand-50">Tải file CSV</a>
              </div>
            </details>
          </nav>
          <form action={logout} className="ml-auto hidden md:block">
            <button className="text-sm text-gray-600 hover:underline">Đăng xuất</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 pb-28 pt-4 sm:px-4 md:pb-8 md:pt-5">{children}</main>
      <BottomNav logout={logout} badge={badge} />
    </div>
  );
}
