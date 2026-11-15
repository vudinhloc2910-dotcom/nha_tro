"use client";

import { useState, useTransition } from "react";
import { setInvoiceStatus } from "./actions";
import { STATUS_CLASS, STATUS_LABEL, type Status } from "@/lib/format";

const OPTS: { v: "paid" | "unpaid" | "overdue"; label: string }[] = [
  { v: "paid", label: "Đã thu" },
  { v: "unpaid", label: "Chưa thu" },
  { v: "overdue", label: "Quá hạn" },
];

/** Ô chọn nhanh trạng thái hóa đơn (Đã thu / Chưa thu / Quá hạn) ngay trong danh sách. */
export default function StatusSelect({ invoiceId, status, paid }: { invoiceId: number; status: Status; paid: number }) {
  const [cur, setCur] = useState<Status>(status);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const shown: "paid" | "unpaid" | "overdue" = cur === "paid" ? "paid" : cur === "overdue" ? "overdue" : "unpaid";

  function change(v: "paid" | "unpaid" | "overdue") {
    if (v === shown) return;
    if (v !== "paid" && paid > 0 && !confirm("Đổi sang '" + (v === "unpaid" ? "Chưa thu" : "Quá hạn") + "' sẽ xóa các khoản đã thu của hóa đơn này. Tiếp tục?")) return;
    const prev = cur;
    setCur(v);
    setMsg("");
    start(async () => {
      const r = await setInvoiceStatus(invoiceId, v);
      if (!r.ok) { setCur(prev); setMsg(r.error ?? "Lỗi"); }
    });
  }

  return (
    <span className="inline-flex flex-col">
      <select
        value={shown}
        disabled={pending}
        onChange={(e) => change(e.target.value as "paid" | "unpaid" | "overdue")}
        aria-label="Trạng thái hóa đơn"
        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_CLASS[cur]} ${pending ? "opacity-60" : ""}`}
      >
        {OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      {cur === "partial" && <span className="text-[10px] text-gray-500">{STATUS_LABEL.partial}</span>}
      {msg && <span className="text-[10px] text-red-600">{msg}</span>}
    </span>
  );
}
