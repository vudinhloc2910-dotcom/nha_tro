import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";
import { getSettings } from "@/lib/db";

const MAIN = [
  { href: "/", label: "Hóa đơn tháng" },
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
  const s = await getSettings();
  return (
    <div>
      <header className="no-print border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="font-bold text-blue-800">{s.house_name || "Nhà trọ"}</span>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {MAIN.map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-2 py-1 text-gray-700 hover:bg-gray-100">
                {n.label}
              </Link>
            ))}
            <details className="relative">
              <summary className="cursor-pointer list-none rounded px-2 py-1 text-gray-700 hover:bg-gray-100">Khác ▾</summary>
              <div className="absolute z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {MORE.map((n) => (
                  <Link key={n.href} href={n.href} className="block px-3 py-2 text-gray-700 hover:bg-gray-50">
                    {n.label}
                  </Link>
                ))}
                <a href="/export" className="block px-3 py-2 text-gray-700 hover:bg-gray-50">Tải file CSV</a>
              </div>
            </details>
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
