"use client";

import { logRemind } from "./actions";
import { CopyButton } from "./copy-button";
import { vnd } from "@/lib/format";

/** Nút "Nhắc nợ": chép tin nhắn nhắc có link hóa đơn, mở Zalo của khách và ghi vào nhật ký. */
export function RemindButton({ roomId, code, month, amount, days, token, phone }: { roomId: number; code: string; month: string; amount: number; days: number; token: string; phone: string }) {
  const msg = `Chào anh/chị phòng ${code}, tiền trọ tháng ${month.slice(5)} còn ${vnd(amount)}, đã quá hạn ${days} ngày. Anh/chị vui lòng chuyển khoản giúp em theo hóa đơn tại: {link} . Cảm ơn anh/chị!`;
  return <CopyButton path={`/pay/${token}`} message={msg} label={phone ? "Nhắc nợ qua Zalo" : "Chép tin nhắc nợ"} primary zaloPhone={phone} onZalo={() => { void logRemind(roomId); }} />;
}
