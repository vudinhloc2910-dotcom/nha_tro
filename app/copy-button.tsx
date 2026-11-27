"use client";

import { useState } from "react";

/** Nút sao chép: chép link hóa đơn, hoặc cả tin nhắn có sẵn link (thay {link} bằng địa chỉ đầy đủ). */
export function CopyButton({ path, label, message, primary, zaloPhone, onZalo, onCopied }: { path: string; label: string; message?: string; primary?: boolean; zaloPhone?: string; onZalo?: () => void; onCopied?: () => void }) {
  const [done, setDone] = useState(false);

  async function copy() {
    const link = `${window.location.origin}${path}`;
    const text = message ? message.replace("{link}", link) : link;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    // Có số điện thoại thì mở luôn Zalo của khách: chỉ việc dán tin nhắn đã chép
    const z = (zaloPhone ?? "").replace(/[^\d]/g, "");
    if (z.length >= 9) { window.open(`https://zalo.me/${z.startsWith("84") ? "0" + z.slice(2) : z}`, "_blank", "noopener"); onZalo?.(); }
    onCopied?.();
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }

  const base = "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap";
  const tone = primary ? "bg-brand-700 text-white hover:bg-brand-800" : "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50";
  return (
    <button type="button" onClick={copy} className={`${base} ${tone}`}>
      {done ? "Đã chép ✓" : label}
    </button>
  );
}
