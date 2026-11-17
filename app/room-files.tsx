"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteRoomFile, uploadRoomFile } from "./actions";

export type RoomFile = { id: number; kind: string; name: string; mime: string; size: number; created: string; tenant_id: number | null; tname: string | null };

const KIND_LABEL: Record<string, string> = { cccd: "CCCD / giấy tờ tùy thân", contract: "Hợp đồng thuê", other: "Giấy tờ khác" };
const KIND_CLS: Record<string, string> = { cccd: "bg-sky-100 text-sky-800", contract: "bg-violet-100 text-violet-800", other: "bg-gray-100 text-gray-700" };
const MAX_BYTES = 2.8 * 1024 * 1024;

/** Nén ảnh về tối đa 1600px, JPEG chất lượng ~80% để nhẹ (ảnh chụp điện thoại thường 3-8MB). */
async function compress(file: File): Promise<{ blob: Blob; mime: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.7, 0.55]) {
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return { blob, mime: "image/jpeg" };
  }
  throw new Error("Ảnh quá nặng, hãy chụp lại với độ phân giải thấp hơn");
}
const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
  fr.onerror = () => rej(new Error("Không đọc được file"));
  fr.readAsDataURL(blob);
});
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Mục "Giấy tờ": tải lên và xem ảnh CCCD, hợp đồng của phòng. */
export function RoomFiles({ roomId, files }: { roomId: number; files: RoomFile[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("cccd");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true); setMsg(null);
    let okCount = 0;
    try {
      for (const f of Array.from(list)) {
        let blob: Blob = f, mime = f.type;
        if (f.type.startsWith("image/")) ({ blob, mime } = await compress(f));
        else if (f.type !== "application/pdf") throw new Error(`"${f.name}": chỉ nhận ảnh hoặc PDF`);
        else if (f.size > MAX_BYTES) throw new Error(`"${f.name}": PDF quá lớn (tối đa 2,8 MB)`);
        const name = f.type.startsWith("image/") ? f.name.replace(/\.[^.]+$/, "") + ".jpg" : f.name;
        const res = await uploadRoomFile({ roomId, kind, name, mime, data: await toBase64(blob) });
        if (!res.ok) throw new Error(res.error ?? "Không tải lên được");
        okCount++;
      }
      setMsg({ ok: true, t: `Đã tải lên ${okCount} file` });
    } catch (e) {
      setMsg({ ok: false, t: (e instanceof Error ? e.message : "Không tải lên được") + (okCount ? ` (đã tải ${okCount} file trước đó)` : "") });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function del(f: RoomFile) {
    if (!confirm(`Xóa file "${f.name}"? Không khôi phục lại được.`)) return;
    await deleteRoomFile(f.id);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Loại giấy tờ</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <label className={`inline-flex cursor-pointer items-center justify-center rounded-lg bg-gradient-to-b from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-brand-700 hover:to-brand-800 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Đang tải lên…" : "+ Chọn ảnh / PDF"}
          <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void onPick(e.target.files)} />
        </label>
        <span className="text-xs text-gray-500">Ảnh được tự nén cho nhẹ. Chọn được nhiều file một lần.</span>
      </div>
      {msg && <p className={`mt-2 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{msg.t}</p>}

      {files.length === 0 ? <p className="mt-3 text-sm text-gray-500">Chưa có giấy tờ nào.</p> : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="block bg-gray-50">
                {f.mime.startsWith("image/")
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/files/${f.id}`} alt={f.name} loading="lazy" className="h-40 w-full object-cover" />
                  : <div className="flex h-40 items-center justify-center text-4xl text-red-500">PDF</div>}
              </a>
              <div className="space-y-1 p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_CLS[f.kind] ?? KIND_CLS.other}`}>{KIND_LABEL[f.kind] ?? "Khác"}</span>
                  <button type="button" onClick={() => void del(f)} className="text-xs text-red-700 hover:underline">Xóa</button>
                </div>
                <div className="truncate text-gray-800" title={f.name}>{f.name}</div>
                <div className="text-xs text-gray-500">{kb(f.size)} · {f.created.slice(8, 10)}/{f.created.slice(5, 7)}/{f.created.slice(0, 4)}{f.tname ? ` · khách ${f.tname}` : ""}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
