import { currentMonth, monthLabel } from "@/lib/format";
import { currentHouse } from "@/lib/house";
import { loadMonth } from "@/lib/monthdata";
import { Flash, MonthPicker } from "../components";
import { MonthGrid } from "../month-grid";

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const md = await loadMonth(house.id, month);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Hóa đơn tháng {monthLabel(month)}</h1>
          <p className="text-sm text-gray-600">{house.name}</p>
        </div>
        <MonthPicker action="/" month={month} />
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <MonthGrid
        key={`${house.id}-${month}-${JSON.stringify(md.rooms)}`}
        month={month}
        houseName={house.name}
        waterMode={md.settings.water_mode === "person" ? "person" : "meter"}
        services={md.services}
        rooms={md.rooms}
        vacant={md.vacant}
      />
    </div>
  );
}
