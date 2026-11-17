"use client";

import { useState } from "react";

const toVN = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
/** "dd/mm/yyyy" -> "yyyy-mm-dd" nếu là ngày có thật, ngược lại null. */
function toISO(vn: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(vn);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
/** Gõ chỉ cần số: 06112026 -> 06/11/2026. */
function mask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  /** Giá trị dạng yyyy-mm-dd (chế độ điều khiển) */
  value?: string;
  /** Giá trị ban đầu (dùng trong form có `name`) */
  defaultValue?: string;
  onChange?: (iso: string) => void;
  /** Bắt buộc có ngày: xóa trắng rồi rời ô thì quay về ngày cũ, không báo ô trống lên trên */
  keepOnEmpty?: boolean;
};

/** Ô nhập ngày theo kiểu Việt Nam: ngày/tháng/năm (không phụ thuộc ngôn ngữ của trình duyệt). */
export function DateVN({ value, defaultValue, onChange, onBlur, name, keepOnEmpty, ...rest }: Props) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = value ?? inner;
  const [text, setText] = useState(toVN(iso));
  const [seen, setSeen] = useState(iso);
  // Giá trị bên ngoài đổi (không phải do đang gõ) thì cập nhật chữ hiển thị
  if (iso !== seen) { setSeen(iso); if (toISO(text) !== iso) setText(toVN(iso)); }

  return (
    <>
      <input
        {...rest}
        type="text" inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} autoComplete="off"
        value={text}
        onChange={(e) => {
          const t = mask(e.target.value);
          setText(t);
          if (t === "") { if (keepOnEmpty) return; setInner(""); setSeen(""); onChange?.(""); return; }
          const v = toISO(t);
          if (v) { setInner(v); setSeen(v); onChange?.(v); }
        }}
        onBlur={(e) => { if ((text !== "" || keepOnEmpty) && toISO(text) === null) setText(toVN(iso)); onBlur?.(e); }}
      />
      {name && <input type="hidden" name={name} value={toISO(text) ?? ""} />}
    </>
  );
}
