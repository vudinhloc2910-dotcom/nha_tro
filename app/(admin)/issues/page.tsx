import { MoneyField } from "../../money-field";
import Link from "next/link";
import { all } from "@/lib/db";
import { ago } from "@/lib/activity";
import { currentHouse } from "@/lib/house";
import { vnd } from "@/lib/format";
import { addIssue, deleteIssue, setIssueStatus } from "../../actions";
import { Flash } from "../../components";
import { accent, btnCls, btnDangerCls, cardCls, inputCls, labelCls } from "@/lib/ui";

type Issue = { id: number; room_id: number | null; code: string | null; title: string; detail: string; status: "open" | "doing" | "done"; source: string; cost: number; created: string };

const ST = {
  open: { label: "Mới báo", cls: "bg-rose-100 text-rose-800" },
  doing: { label: "Đang xử lý", cls: "bg-amber-100 text-amber-800" },
  done: { label: "Đã xong", cls: "bg-teal-100 text-teal-800" },
} as const;

/** Sự cố và bảo trì: chủ trọ ghi hoặc khách báo từ link hóa đơn; theo dõi mới báo, đang xử lý, đã xong và chi phí sửa. */
export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; s?: string }> }) {
  const sp = await searchParams;
  const house = await currentHouse();
  const filter = sp.s === "open" || sp.s === "doing" || sp.s === "done" ? sp.s : "all";
  const all_ = await all<Issue>(
    `SELECT i.id, i.room_id, r.code, i.title, i.detail, i.status, i.source, i.cost, i.created
     FROM issues i LEFT JOIN rooms r ON r.id=i.room_id WHERE i.house_id=? ORDER BY CASE i.status WHEN 'done' THEN 1 ELSE 0 END, i.id DESC`, house.id
  );
  const list = filter === "all" ? all_ : all_.filter((i) => i.status === filter);
  const rooms = await all<{ id: number; code: string }>("SELECT id, code FROM rooms WHERE house_id=? ORDER BY code", house.id);
  rooms.sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true }));
  const n = (s: string) => all_.filter((i) => i.status === s).length;
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Sự cố và bảo trì</h1>
        <p className="text-sm text-gray-600">{house.name}. Khách cũng báo được từ trang hóa đơn của họ.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid grid-cols-3 gap-3">
        <div className={`${cardCls} ${accent.rose}`}><div className="text-xs text-gray-500">Mới báo</div><div className="mt-1 text-xl font-bold">{n("open")}</div></div>
        <div className={`${cardCls} ${accent.amber}`}><div className="text-xs text-gray-500">Đang xử lý</div><div className="mt-1 text-xl font-bold">{n("doing")}</div></div>
        <div className={`${cardCls} ${accent.teal}`}><div className="text-xs text-gray-500">Đã xong</div><div className="mt-1 text-xl font-bold">{n("done")}</div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([["all", "Tất cả"], ["open", "Mới báo"], ["doing", "Đang xử lý"], ["done", "Đã xong"]] as const).map(([k, l]) => (
          <Link key={k} href={`/issues?s=${k}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === k ? "bg-brand-600 text-white" : "border border-brand-200 bg-white text-brand-800 hover:bg-brand-50"}`}>{l}</Link>
        ))}
      </div>

      <section className="space-y-3">
        {list.length === 0 && <p className={`${cardCls} text-sm text-gray-500`}>Không có sự cố nào.</p>}
        {list.map((i) => (
          <div key={i.id} className={`${cardCls} ${i.status === "done" ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ST[i.status].cls}`}>{ST[i.status].label}</span>
              {i.code && <Link href={`/rooms/${i.room_id}`} className="font-semibold text-brand-800 hover:underline">Phòng {i.code}</Link>}
              {i.source === "tenant" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">Khách báo</span>}
              <span className="ml-auto text-xs text-gray-400">{ago(i.created, now)}</span>
            </div>
            <div className="mt-1 font-medium">{i.title}</div>
            {i.detail && <p className="text-sm text-gray-600">{i.detail}</p>}
            {i.status === "done" && i.cost > 0 && <p className="mt-1 text-sm text-gray-600">Chi phí sửa: <b>{vnd(i.cost)}</b> (đã vào chi phí phát sinh)</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {i.status === "open" && <form action={setIssueStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="doing" /><button className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50">Bắt đầu xử lý</button></form>}
              {i.status !== "done" && (
                <form action={setIssueStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="done" />
                  <div className="w-40"><MoneyField name="cost" placeholder="Chi phí sửa (đ)" className={`${inputCls} py-1.5`} /></div>
                  <button className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">Đã xong</button>
                </form>
              )}
              {i.status === "done" && <form action={setIssueStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="open" /><button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50">Mở lại</button></form>}
              <form action={deleteIssue} className="ml-auto"><input type="hidden" name="id" value={i.id} /><button className={btnDangerCls}>Xóa</button></form>
            </div>
          </div>
        ))}
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Ghi sự cố mới</h2>
        <form action={addIssue} className="grid gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>Phòng</label>
            <select name="room_id" className={inputCls}><option value="">Chung cả nhà</option>{rooms.map((r) => <option key={r.id} value={r.id}>Phòng {r.code}</option>)}</select></div>
          <div className="sm:col-span-3"><label className={labelCls}>Sự cố</label><input name="title" required className={inputCls} placeholder="VD: Bình nóng lạnh không nóng" /></div>
          <div className="sm:col-span-3"><label className={labelCls}>Mô tả thêm</label><input name="detail" className={inputCls} /></div>
          <div className="flex items-end"><button className={btnCls}>Ghi sự cố</button></div>
        </form>
      </section>
    </div>
  );
}
