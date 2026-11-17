"use client";

import { useState } from "react";

/** "3000000" -> "3.000.000" (có thể có dấu trừ). */
export function fmtMoney(raw: string | number | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (s === "") return "";
  const neg = s.startsWith("-");
  const d = s.replace(/[^\d]/g, "");
  if (d === "") return neg ? "-" : "";
  return (neg ? "-" : "") + Number(d).toLocaleString("vi-VN");
}
const clean = (s: string, neg: boolean) => {
  const isNeg = neg && s.trim().startsWith("-");
  const d = s.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  return d === "" ? (isNeg ? "-" : "") : (isNeg ? "-" : "") + d;
};

type Props = {
  className?: string; placeholder?: string; allowNegative?: boolean; unit?: string; required?: boolean; disabled?: boolean;
  id?: string; "data-room"?: number; "aria-label"?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>; onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Chế độ điều khiển: giá trị là chuỗi số thường ("3000000") */
  value?: string; onChange?: (raw: string) => void;
  /** Chế độ form: có `name` thì gửi lên dạng số thường (không dấu chấm) */
  name?: string; defaultValue?: string | number | null;
};

/**
 * Ô nhập tiền: hiện dấu chấm ngăn nghìn và đơn vị "đ" cố định bên phải (3.000.000 đ),
 * để khỏi gõ nhầm thừa/thiếu số 0. Bên trong vẫn lưu số thường.
 */
export function MoneyField({ value, onChange, name, defaultValue, className = "", placeholder, allowNegative, unit = "đ", required, disabled, onBlur, onKeyDown, ...rest }: Props) {
  const [inner, setInner] = useState(() => clean(String(defaultValue ?? ""), !!allowNegative));
  const raw = value !== undefined ? clean(value, !!allowNegative) : inner;
  return (
    <div className="relative">
      <input
        {...rest}
        type="text" inputMode={allowNegative ? "text" : "numeric"} autoComplete="off" required={required} disabled={disabled}
        value={fmtMoney(raw)} placeholder={placeholder}
        onChange={(e) => { const r = clean(e.target.value, !!allowNegative); setInner(r); onChange?.(r); }}
        onBlur={onBlur} onKeyDown={onKeyDown}
        className={`${className} pr-6 text-right tabular-nums`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">{unit}</span>
      {name && <input type="hidden" name={name} value={raw === "-" ? "" : raw} />}
    </div>
  );
}
