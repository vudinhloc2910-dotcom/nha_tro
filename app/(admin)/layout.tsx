import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";
import { listHouses } from "@/lib/db";
import { currentHouse } from "@/lib/house";
import { houseTodos } from "@/lib/todos";
import { selectedMonth } from "@/lib/month";
import { HouseSwitcher } from "../house-switcher";
import { MonthPicker } from "../month-picker";
import { BottomNav } from "../bottom-nav";
import { TopNav } from "../top-nav";
import { Logo } from "../logo";
import { SearchBox } from "../search-box";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const houses = await listHouses();
  const house = await currentHouse();
  const month = await selectedMonth();
  const todos = await houseTodos(house.id);
  const badge = todos.filter((t) => !t.done).length;
  return (
    <div>
      <header className="no-print sticky top-0 z-30 border-b border-stone-200 bg-white/95 shadow-[0_1px_0_0_rgba(15,23,42,0.03)] backdrop-blur">
        <div className="h-[3px] bg-gradient-to-r from-brand-400 via-brand-600 to-amber-400" />
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/overview" className="mr-1 hidden shrink-0 md:inline-flex" aria-label="Về trang Tổng quan"><Logo size={32} /></Link>
          <MonthPicker month={month} />
          <HouseSwitcher houses={houses} currentId={house.id} />
          <TopNav badge={badge} />
          <div className="ml-auto hidden items-center gap-4 md:flex">
            <SearchBox />
            <Link href="/account" className="text-sm text-gray-600 hover:underline">Đổi mật khẩu</Link>
            <form action={logout}><button className="text-sm text-gray-600 hover:underline">Đăng xuất</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 pb-28 pt-4 sm:px-4 md:pb-8 md:pt-5">{children}</main>
      <BottomNav logout={logout} badge={badge} />
    </div>
  );
}
