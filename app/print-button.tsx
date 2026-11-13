"use client";

import { btnGhostCls } from "@/lib/ui";

export function PrintButton({ label = "In / Lưu PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${btnGhostCls} no-print`}>
      {label}
    </button>
  );
}
