"use client";

import { useState } from "react";
import { inputCls } from "@/lib/ui";

/** Ô nhập mật khẩu có nút con mắt: bấm để hiện chữ đang gõ, bấm lại để ẩn. */
export function PasswordInput({ name, id, autoComplete, autoFocus, minLength }: { name: string; id?: string; autoComplete?: string; autoFocus?: boolean; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} name={name} type={show ? "text" : "password"} required autoComplete={autoComplete} autoFocus={autoFocus} minLength={minLength}
        className={`${inputCls} pr-12`} spellCheck={false} autoCapitalize="none" autoCorrect="off"
      />
      <button
        type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-500 hover:text-brand-700"
      >
        {show ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12.6 12.6 0 0 1-2.6 3.3M6.6 7.6A12.4 12.4 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
