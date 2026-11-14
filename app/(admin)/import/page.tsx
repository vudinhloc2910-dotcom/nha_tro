import { importSheetAction } from "../../actions";
import { Flash } from "../../components";
import { btnCls, btnGhostCls, cardCls, inputCls, labelCls } from "@/lib/ui";

export const maxDuration = 60;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; notes?: string }> }) {
  const sp = await searchParams;
  const notes = (sp.notes ?? "").split(" | ").filter(Boolean);
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Nhập dữ liệu từ sheet</h1>
      <Flash ok={sp.ok} err={sp.err} />
      {notes.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="mb-1 font-medium">Lưu ý khi nhập:</p>
          <ul className="list-inside list-disc">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      <section className={cardCls}>
        <p className="mb-3 text-sm text-gray-700">
          Chọn file dữ liệu (<code>import-….json</code>, do mình tạo từ sheet cũ của từng nhà). File ghi sẵn tên nhà nên <b>tự nạp đúng nhà</b>. Hóa đơn nhập vào sẽ bị <b>khóa</b> (không tự tính lại).
          Các tháng cũ mặc định <b>đã thu đủ</b> (trừ khi sheet ghi rõ), tháng mới nhất <b>chưa thu</b>. Phòng chưa có sẽ được tạo. Chạy lại nhiều lần được: hóa đơn cùng phòng và tháng sẽ được thay mới.
          Nên bấm <b>Chỉ kiểm tra</b> trước.
        </p>
        <form action={importSheetAction} className="space-y-4">
          <div>
            <label className={labelCls}>File dữ liệu (.json)</label>
            <input type="file" name="file" accept=".json,application/json" required className={inputCls} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="apply_settings" defaultChecked className="mt-1" />
            <span>Cập nhật cài đặt của nhà theo file: giá điện, nước, các dịch vụ, tiền thuê nhà trả chủ, lương quản lý và tài khoản nhận tiền (đọc từ dòng STK của sheet). Ghi đè cài đặt hiện tại của nhà đó.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button name="mode" value="dry" className={btnGhostCls}>Chỉ kiểm tra (không ghi)</button>
            <button name="mode" value="run" className={btnCls}>Nạp vào web</button>
          </div>
        </form>
      </section>
    </div>
  );
}
