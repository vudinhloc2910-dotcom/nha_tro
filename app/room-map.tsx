"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { vnd } from "@/lib/format";
import type { RoomTile } from "@/lib/rooms";

const FILTERS = [
  { k: "all", label: "Tất cả" },
  { k: "rented", label: "Đang thuê" },
  { k: "vacant", label: "Trống" },
  { k: "debt", label: "Nợ tiền" },
] as const;

const TILE: Record<RoomTile["status"], string> = {
  ok: "border-teal-200 bg-teal-50/70 hover:border-teal-400",
  vacant: "border-dashed border-gray-300 bg-gray-50 hover:border-gray-400",
  debt: "border-amber-300 bg-amber-50 hover:border-amber-500",
  overdue: "border-rose-300 bg-rose-50 hover:border-rose-500",
};
const DOT: Record<RoomTile["status"], string> = { ok: "bg-teal-500", vacant: "bg-gray-400", debt: "bg-amber-500", overdue: "bg-rose-500" };

/** Sơ đồ phòng theo tầng: ô màu theo trạng thái, lọc nhanh và tìm theo số phòng, tên khách, số điện thoại. */
export function RoomMap({ rooms }: { rooms: RoomTile[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["k"]>("all");
  const [q, setQ] = useState("");

  const count = (k: string) => rooms.filter((r) => match(r, k)).length;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rooms.filter((r) => match(r, filter) && (!t || r.code.toLowerCase().includes(t) || (r.tenant ?? "").toLowerCase().includes(t) || r.phone.includes(t)));
  }, [rooms, filter, q]);
  const floors = useMemo(() => {
    const m = new Map<string, RoomTile[]>();
    for (const r of shown) m.set(`${r.floor}|${r.floorLabel}`, [...(m.get(`${r.floor}|${r.floorLabel}`) ?? []), r]);
    return [...m.entries()].map(([k, list]) => ({ label: k.split("|")[1], list, all: rooms.filter((r) => `${r.floor}|${r.floorLabel}` === k) }));
  }, [shown, rooms]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.k} type="button" onClick={() => setFilter(f.k)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === f.k ? "bg-brand-600 text-white" : "border border-brand-200 bg-white text-brand-800 hover:bg-brand-50"}`}>
              {f.label} <span className={filter === f.k ? "text-brand-100" : "text-gray-400"}>{count(f.k)}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm số phòng, tên khách, số điện thoại"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 sm:w-72" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {([["ok", "Đang thuê"], ["debt", "Chưa thu đủ"], ["overdue", "Quá hạn"], ["vacant", "Trống"]] as const).map(([s, l]) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />{l}</span>
        ))}
      </div>

      {floors.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Không có phòng nào khớp.</p>}
      {floors.map((fl) => (
        <section key={fl.label}>
          <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold">{fl.label}
            <span className="text-xs font-normal text-gray-500">{fl.all.length} phòng{fl.all.some((r) => r.status === "vacant") ? ` · ${fl.all.filter((r) => r.status === "vacant").length} trống` : ""}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {fl.list.map((r) => (
              <Link key={r.id} href={`/rooms/${r.id}`} className={`block rounded-2xl border-2 p-3 transition ${TILE[r.status]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold">{r.code}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT[r.status]}`} />
                </div>
                <div className="mt-0.5 truncate text-sm text-gray-700">{r.tenant ?? <span className="text-gray-400">Trống{r.vacantDays !== null ? ` ${r.vacantDays} ngày` : ""}</span>}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{r.people ? `${r.people} người` : " "}</span>
                  <span>{vnd(r.rent)}</span>
                </div>
                {r.debt > 0 && <div className={`mt-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${r.status === "overdue" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{r.status === "overdue" ? "Quá hạn " : "Còn "}{vnd(r.debt)}</div>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function match(r: RoomTile, k: string) {
  if (k === "rented") return r.status !== "vacant";
  if (k === "vacant") return r.status === "vacant";
  if (k === "debt") return r.status === "debt" || r.status === "overdue";
  return true;
}
