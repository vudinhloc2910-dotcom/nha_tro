import { login } from "../actions";
import { PasswordInput } from "../password-input";
import { btnCls, labelCls } from "@/lib/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-xl font-bold">Quản lý nhà trọ</h1>
      <p className="mb-6 text-sm text-gray-600">Đăng nhập dành cho chủ trọ</p>
      <form action={login} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <label className={labelCls} htmlFor="password">Mật khẩu</label>
          <PasswordInput id="password" name="password" autoFocus autoComplete="current-password" />
        </div>
        {err && <p className="text-sm text-red-700">Sai mật khẩu.</p>}
        <button className={`${btnCls} w-full`}>Đăng nhập</button>
      </form>
    </main>
  );
}
