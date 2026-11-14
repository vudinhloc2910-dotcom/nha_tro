"use client";

import { usePathname } from "next/navigation";
import { selectHouse } from "./actions";

type H = { id: number; name: string };

/** Ô chọn nhà ở thanh trên cùng: chọn xong tự chuyển nhà và ở lại trang đang xem. */
export function HouseSwitcher({ houses, currentId }: { houses: H[]; currentId: number }) {
  const path = usePathname();
  // Trang chi tiết (phòng/hóa đơn của nhà khác) thì về trang danh sách tương ứng
  const back = path.startsWith("/rooms/") ? "/rooms" : path.startsWith("/invoices/") ? "/invoices" : path;
  return (
    <form action={selectHouse}>
      <input type="hidden" name="back" value={back} />
      <select
        name="house"
        defaultValue={currentId}
        aria-label="Chọn nhà"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-[16rem] rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-sm font-semibold text-brand-900"
      >
        {houses.map((h) => (
          <option key={h.id} value={h.id}>{h.name}</option>
        ))}
      </select>
    </form>
  );
}
