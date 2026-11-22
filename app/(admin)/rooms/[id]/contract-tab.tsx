import { DateVN } from "../../../date-input";
import { MoneyField } from "../../../money-field";
import { loadRoomContracts } from "@/lib/contracts-db";
import { KIND_LABEL, STATUS_LABEL, daysUntil, isDate, noticeDate, schedule } from "@/lib/contracts";
import { addAddendum, renewContract, saveContract, terminateContract } from "../../../contract-actions";
import { dateVN, today, vnd } from "@/lib/format";
import { btnCls, btnDangerCls, cardCls, inputCls, labelCls, tdCls, thCls } from "@/lib/ui";

const d = (s: string) => (isDate(s) ? dateVN(s) : "—");

/** Tab Hợp đồng của phòng: điều khoản, nhắc gia hạn, gia hạn / phụ lục / chấm dứt, lịch kỳ thu để xem. */
export async function ContractTab({ roomId, roomRent, hasTenant }: { roomId: number; roomRent: number; hasTenant: boolean }) {
  const { active, contracts, events } = await loadRoomContracts(roomId);
  const t0 = today();
  const left = active && isDate(active.end_date) ? daysUntil(t0, active.end_date) : null;
  const remindFrom = active ? noticeDate(active) : null;
  const rows = active ? schedule(active) : [];
  const evOf = (id: number) => events.filter((e) => e.contract_id === id);
  const past = contracts.filter((c) => c.status !== "active");

  return (
    <>
      <section className={cardCls}>
        <h2 className="mb-1 font-semibold">{active ? "Hợp đồng đang hiệu lực" : "Tạo hợp đồng"}</h2>
        {!active && !hasTenant && <p className="text-sm text-gray-600">Phòng chưa có khách. Thêm khách ở tab Thông tin chung trước, rồi quay lại đây tạo hợp đồng.</p>}
        {(active || hasTenant) && (
          <>
            {active && left !== null && (
              <p className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${left < 0 ? "bg-rose-100 text-rose-800" : left <= active.notice_days ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>
                {left < 0 ? `Đã hết hạn ${-left} ngày` : left === 0 ? "Hết hạn hôm nay" : `Còn ${left} ngày`}
                {remindFrom && left > active.notice_days ? ` · nhắc gia hạn từ ${dateVN(remindFrom)}` : ""}
              </p>
            )}
            <form action={saveContract} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="room_id" value={roomId} />
              {active && <input type="hidden" name="id" value={active.id} />}
              <div><label className={labelCls}>Ngày bắt đầu</label><DateVN name="start_date" defaultValue={active?.start_date ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Ngày kết thúc</label><DateVN name="end_date" defaultValue={active?.end_date ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Ngày bàn giao</label><DateVN name="handover_date" defaultValue={active?.handover_date ?? ""} className={inputCls} /></div>
              <div><label className={labelCls}>Báo gia hạn trước (ngày)</label><input name="notice_days" type="number" min="0" max="365" defaultValue={active?.notice_days ?? 30} className={inputCls} /></div>
              <div><label className={labelCls}>Giá thuê trong hợp đồng (đ/tháng)</label><MoneyField name="rent" defaultValue={active?.rent ?? roomRent} className={inputCls} /></div>
              <div><label className={labelCls}>Tiền cọc (đ)</label><MoneyField name="deposit" defaultValue={active?.deposit ?? 0} className={inputCls} /></div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2"><input type="checkbox" name="rent_from_start" defaultChecked={active ? !!active.rent_from_start : true} />Tính tiền thuê từ ngày bắt đầu hợp đồng</label>
              <div className="sm:col-span-3"><label className={labelCls}>Ghi chú</label><input name="note" defaultValue={active?.note ?? ""} className={inputCls} placeholder="VD: cọc 2 tháng, tăng giá 5% từ năm thứ hai" /></div>
              <div className="flex items-end"><button className={btnCls}>{active ? "Lưu hợp đồng" : "Tạo hợp đồng"}</button></div>
            </form>
            {active && active.rent !== roomRent && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Giá thuê trong hợp đồng ({vnd(active.rent)}) khác giá thuê đang tính hóa đơn của phòng ({vnd(roomRent)}). Hóa đơn vẫn tính theo giá của phòng; nếu cần đổi, sửa ở tab Thông tin chung.</p>
            )}
          </>
        )}
      </section>

      {active && (
        <section className={cardCls}>
          <h2 className="mb-3 font-semibold">Gia hạn, phụ lục, chấm dứt</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <form action={renewContract} className="space-y-2 rounded-xl border border-gray-200 p-3">
              <input type="hidden" name="id" value={active.id} />
              <h3 className="text-sm font-semibold">Gia hạn</h3>
              <div><label className={labelCls}>Hết hạn mới</label><DateVN name="new_end" defaultValue="" className={inputCls} /></div>
              <div><label className={labelCls}>Giá thuê mới (để trống nếu giữ nguyên)</label><MoneyField name="rent_after" defaultValue="" className={inputCls} /></div>
              <div><label className={labelCls}>Ghi chú</label><input name="detail" className={inputCls} /></div>
              <button className={btnCls}>Gia hạn</button>
            </form>
            <form action={addAddendum} className="space-y-2 rounded-xl border border-gray-200 p-3">
              <input type="hidden" name="id" value={active.id} />
              <h3 className="text-sm font-semibold">Phụ lục</h3>
              <div><label className={labelCls}>Ngày hiệu lực</label><DateVN name="event_date" defaultValue={t0} className={inputCls} /></div>
              <div><label className={labelCls}>Nội dung thay đổi</label><input name="detail" required className={inputCls} placeholder="VD: thêm 1 người ở, đổi giá" /></div>
              <div><label className={labelCls}>Giá thuê mới (nếu có)</label><MoneyField name="rent_after" defaultValue="" className={inputCls} /></div>
              <button className={btnCls}>Ghi phụ lục</button>
            </form>
            <form action={terminateContract} className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
              <input type="hidden" name="id" value={active.id} />
              <h3 className="text-sm font-semibold text-red-800">Chấm dứt</h3>
              <div><label className={labelCls}>Ngày chấm dứt</label><DateVN name="event_date" defaultValue={t0} className={inputCls} /></div>
              <div><label className={labelCls}>Lý do</label><input name="detail" className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Cọc hoàn trả</label><MoneyField name="deposit_returned" defaultValue={0} className={inputCls} /></div>
                <div><label className={labelCls}>Cọc khấu trừ</label><MoneyField name="deposit_deducted" defaultValue={0} className={inputCls} /></div>
              </div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="checkout" />Đồng thời đánh dấu khách đã trả phòng</label>
              <button className={btnDangerCls}>Chấm dứt hợp đồng</button>
            </form>
          </div>
          <p className="mt-2 text-xs text-gray-500">Phụ lục và gia hạn chỉ ghi lại hợp đồng, không tự đổi giá tính hóa đơn của phòng. File phụ lục, hợp đồng chụp ảnh thì tải ở mục &quot;Giấy tờ&quot; tab Thông tin chung.</p>
        </section>
      )}

      {active && (
        <section className={`${cardCls} overflow-x-auto`}>
          <h2 className="mb-1 font-semibold">Lịch kỳ thu theo hợp đồng ({rows.length} kỳ)</h2>
          <p className="mb-3 text-xs text-gray-500">Chỉ để xem, không tạo hóa đơn. Mỗi kỳ một tháng tính từ ngày bắt đầu; kỳ cuối cắt ở ngày kết thúc; tiền mỗi kỳ là giá thuê trong hợp đồng (chưa gồm điện, nước, dịch vụ).</p>
          {rows.length === 0 ? <p className="text-sm text-gray-500">Chưa đủ ngày bắt đầu và kết thúc.</p> : (
            <table className="w-full min-w-[26rem]">
              <thead><tr><th className={thCls}>Kỳ</th><th className={thCls}>Từ ngày</th><th className={thCls}>Đến ngày</th><th className={`${thCls} text-right`}>Tiền thuê</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.no}><td className={tdCls}>{r.no}</td><td className={tdCls}>{dateVN(r.start)}</td><td className={tdCls}>{dateVN(r.end)}</td><td className={`${tdCls} text-right`}>{vnd(r.amount)}</td></tr>
                ))}
                <tr className="bg-brand-50 font-bold"><td className={tdCls} colSpan={3}>Tổng tiền thuê cả hợp đồng</td><td className={`${tdCls} text-right`}>{vnd(rows.reduce((a, r) => a + r.amount, 0))}</td></tr>
              </tbody>
            </table>
          )}
        </section>
      )}

      {(active ? evOf(active.id) : []).length > 0 && (
        <section className={`${cardCls} overflow-x-auto`}>
          <h2 className="mb-3 font-semibold">Lịch sử hợp đồng đang hiệu lực</h2>
          <EventTable events={evOf(active!.id)} />
        </section>
      )}

      {past.length > 0 && (
        <section className={cardCls}>
          <h2 className="mb-3 font-semibold">Hợp đồng cũ</h2>
          <div className="space-y-4">
            {past.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                <div className="font-medium">{c.tenant_name ?? "Khách"} · {d(c.start_date)} đến {d(c.end_date)} <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{STATUS_LABEL[c.status] ?? c.status}</span></div>
                {evOf(c.id).length > 0 && <div className="mt-2 overflow-x-auto"><EventTable events={evOf(c.id)} /></div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function EventTable({ events }: { events: Awaited<ReturnType<typeof loadRoomContracts>>["events"] }) {
  return (
    <table className="w-full min-w-[30rem]">
      <thead><tr><th className={thCls}>Ngày</th><th className={thCls}>Loại</th><th className={thCls}>Nội dung</th></tr></thead>
      <tbody className="divide-y divide-gray-100">
        {events.map((e) => (
          <tr key={e.id}>
            <td className={tdCls}>{d(e.event_date)}</td>
            <td className={tdCls}>{KIND_LABEL[e.kind] ?? e.kind}</td>
            <td className={tdCls}>
              {e.detail || "—"}
              {e.kind === "renew" && <div className="text-xs text-gray-500">Hết hạn {d(e.old_end)} → {d(e.new_end)}{e.rent_after !== null ? ` · giá ${vnd(e.rent_after)}` : ""}</div>}
              {e.kind === "addendum" && e.rent_after !== null && <div className="text-xs text-gray-500">Giá thuê mới {vnd(e.rent_after)}</div>}
              {e.kind === "terminate" && (e.deposit_returned > 0 || e.deposit_deducted > 0) && <div className="text-xs text-gray-500">Cọc hoàn {vnd(e.deposit_returned)} · khấu trừ {vnd(e.deposit_deducted)}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
