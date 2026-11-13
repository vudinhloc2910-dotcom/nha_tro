import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";
import { getSettings } from "@/lib/db";

const NAV = [
  { href: "/", label: "Tổng quan" },
  { href: "/rooms", label: "Phòng" },
  { href: "/readings", label: "Điện nước" },
  { href: "/invoices", label: "Hóa đơn" },
  { href: "/settings", label: "Cài đặt" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const s = await getSettings();
  return (
    <div>
      <header className="no-print border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="font-bold text-blue-800">{s.house_name || "Nhà trọ"}</span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-2 py-1 text-gray-700 hover:bg-gray-100">
                {n.label}
              </Link>
            ))}
            <a href="/export" className="rounded px-2 py-1 text-gray-700 hover:bg-gray-100">Xuất CSV</a>
          </nav>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-gray-600 hover:underline">Đăng xuất</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  );
}
