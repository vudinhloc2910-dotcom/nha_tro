import { changePassword } from "../../actions";
import { Flash } from "../../components";
import { PasswordInput } from "../../password-input";
import { btnCls, cardCls, labelCls } from "@/lib/ui";

/** Đổi mật khẩu đăng nhập của chủ trọ. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Đổi mật khẩu đăng nhập</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <section className={cardCls}>
        <form action={changePassword} className="space-y-3">
          <div><label className={labelCls}>Mật khẩu hiện tại</label><PasswordInput name="current" autoComplete="current-password" /></div>
          <div><label className={labelCls}>Mật khẩu mới (từ 8 ký tự)</label><PasswordInput name="next" minLength={8} autoComplete="new-password" /></div>
          <div><label className={labelCls}>Nhập lại mật khẩu mới</label><PasswordInput name="confirm" minLength={8} autoComplete="new-password" /></div>
          <button className={btnCls}>Đổi mật khẩu</button>
        </form>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-gray-500">
          <li>Đổi xong, các máy khác đang đăng nhập sẽ bị đăng xuất. Máy này vẫn giữ đăng nhập.</li>
          <li>Nên đặt mật khẩu dài, khó đoán, không dùng tên hoặc ngày sinh.</li>
          <li>Mật khẩu mới được mã hóa, em không đọc lại được. Nếu quên, báo em để đặt lại từ phía máy chủ.</li>
        </ul>
      </section>
    </div>
  );
}
