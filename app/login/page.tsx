import { login } from "../actions";
import { PasswordInput } from "../password-input";
import { btnCls, labelCls } from "@/lib/ui";
import { LogoMark } from "../logo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark size={64} className="drop-shadow-md" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-900">Nhà Trọ</h1>
        <p className="mt-1 text-sm text-gray-600">Đăng nhập dành cho chủ trọ</p>
      </div>
      <form action={login} className="space-y-4 rounded-2xl border border-stone-200 border-t-4 border-t-brand-500 bg-white p-6 shadow-md">
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
