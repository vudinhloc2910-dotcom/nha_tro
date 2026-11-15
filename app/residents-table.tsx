"use client";

import { useEffect, useState } from "react";
import { saveResidents, type ResidentRow } from "./actions";
import { StatusText, useAutosave } from "./use-autosave";

const inp = "w-full rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[13px] text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const th = "sticky top-0 z-10 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-1.5 py-1.5 text-left text-[11px] font-semibold uppercase text-gray-600 shadow-[0_1px_0_0_#e5e7eb]";
const td = "border-b border-gray-100 px-1 py-0.5 align-middle";
const EMPTY: ResidentRow = { room: "", name: "", cccd: "", gender: "", dob: "", phone: "", job: "", address: "", plate: "", vehicle: "", emergency: "" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

/** Đọc bảng dán từ Excel (cột như sheet: STT, Phòng, Tên, CCCD, Nam, Nữ, Ngày sinh, SĐT, Nghề nghiệp, Hộ khẩu, BKS xe, Loại xe màu, Liên hệ khẩn cấp). */
function parsePaste(text: string): ResidentRow[] {
  const rows = text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return [];
  let col: Record<string, number> = { stt: 0, room: 1, name: 2, cccd: 3, nam: 4, nu: 5, dob: 6, phone: 7, job: 8, address: 9, plate: 10, vehicle: 11, emergency: 12 };
  if (rows[0].some((c) => /^(cccd|cmnd|ten|ho ten)$/.test(norm(c)) || norm(c).includes("cccd"))) {
    col = {};
    rows[0].forEach((c, i) => {
      const n = norm(c);
      if (n === "stt") col.stt = i;
      else if (/^phong/.test(n)) col.room = i;
      else if (/^(ten|ho ten|ho va ten)/.test(n)) col.name = i;
      else if (/cccd|cmnd|can cuoc/.test(n)) col.cccd = i;
      else if (n === "nam") col.nam = i;
      else if (n === "nu") col.nu = i;
      else if (/gioi tinh/.test(n)) col.gender = i;
      else if (/ngay|sinh/.test(n)) col.dob = i;
      else if (/dien thoai|sdt/.test(n)) col.phone = i;
      else if (/nghe/.test(n)) col.job = i;
      else if (/ho khau|thuong tru|dia chi|que quan/.test(n)) col.address = i;
      else if (/bks|bien so/.test(n)) col.plate = i;
      else if (/loai xe|mau/.test(n)) col.vehicle = i;
      else if (/lien he|khan cap/.test(n)) col.emergency = i;
    });
    rows.shift();
  }
  const get = (r: string[], k: string) => (col[k] === undefined ? "" : (r[col[k]] ?? ""));
  const out: ResidentRow[] = [];
  let room = "";
  for (const r of rows) {
    const rm = get(r, "room");
    if (rm) room = rm; // ô phòng gộp trong Excel chỉ có ở dòng đầu: các dòng sau lấy phòng ở trên
    const name = get(r, "name");
    if (!name) continue;
    const g = get(r, "gender");
    out.push({
      room, name, cccd: get(r, "cccd"), dob: get(r, "dob"), phone: get(r, "phone"), job: get(r, "job"), address: get(r, "address"),
      gender: g ? (/^n[uữ]/i.test(g) ? "Nữ" : /^nam/i.test(g) ? "Nam" : "") : get(r, "nam") ? "Nam" : get(r, "nu") ? "Nữ" : "",
      plate: get(r, "plate"), vehicle: get(r, "vehicle"), emergency: get(r, "emergency"),
    });
  }
  return out;
}

/** Danh sách người ở từng phòng (như sheet "Danh sách người ở"): sửa trực tiếp trong bảng, tự lưu khi rời ô. */
export function ResidentsTable({ initial, roomCodes }: { initial: ResidentRow[]; roomCodes: string[] }) {
  const [rows, setRows] = useState<ResidentRow[]>(initial);
  const [status, setStatus] = useState("");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const auto = useAutosave(rows, (v) => saveResidents(v), setStatus);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (auto.dirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [auto]);

  const up = (i: number, p: Partial<ResidentRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => setRows((r) => [...r, { ...EMPTY, room: r.length ? r[r.length - 1].room : "" }]);
  const importPaste = () => {
    const added = parsePaste(paste);
    if (!added.length) { setNote("Không đọc được dòng nào. Hãy copy cả các ô từ Excel (có cột Tên) rồi dán vào."); return; }
    setRows((r) => [...r, ...added]);
    setPaste("");
    setNote(`Đã thêm ${added.length} người. Kiểm tra lại cột Phòng rồi sửa nếu cần.`);
  };

  const cols: { k: keyof ResidentRow; label: string; w: string; type?: string; list?: string }[] = [
    { k: "room", label: "Phòng", w: "w-20", list: "res-rooms" },
    { k: "name", label: "Họ và tên", w: "w-44" },
    { k: "cccd", label: "CCCD", w: "w-32" },
    { k: "gender", label: "Giới tính", w: "w-20" },
    { k: "dob", label: "Ngày sinh", w: "w-28" },
    { k: "phone", label: "Số điện thoại", w: "w-28" },
    { k: "job", label: "Nghề nghiệp", w: "w-28" },
    { k: "address", label: "Hộ khẩu thường trú", w: "w-72" },
    { k: "plate", label: "Biển số xe", w: "w-28" },
    { k: "vehicle", label: "Loại xe, màu", w: "w-32" },
    { k: "emergency", label: "Liên hệ khẩn cấp", w: "w-36" },
  ];

  return (
    <section onBlur={auto.flush} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Danh sách người ở</h2>
          <p className="text-xs text-gray-500">Từng người trong phòng: CCCD, ngày sinh, hộ khẩu, xe, liên hệ khẩn cấp… Dùng để khai tạm trú. Tự lưu khi rời ô.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusText t={status} />
          <a href="/residents-export" className="rounded-xl border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Tải Excel (CSV)</a>
          <button type="button" onClick={auto.flush} className="rounded-xl border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Lưu ngay</button>
        </div>
      </div>

      <div data-nav-scope className="max-h-[70vh] overflow-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[78rem] border-collapse">
          <thead>
            <tr>
              <th className={`${th} left-0 z-20 w-10`}>STT</th>
              {cols.map((c) => <th key={c.k} className={th}>{c.label}</th>)}
              <th className={`${th} w-8`} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length + 2} className="px-3 py-6 text-center text-sm text-gray-500">Chưa có người ở nào. Bấm &quot;+ Thêm người&quot; hoặc dán bảng từ Excel bên dưới.</td></tr>}
            {rows.map((r, i) => {
              const sameRoom = i > 0 && rows[i - 1].room === r.room && r.room !== "";
              return (
                <tr key={i} className={sameRoom ? "" : "border-t-2 border-t-gray-200"}>
                  <td className={`${td} sticky left-0 bg-white text-center text-xs text-gray-500`}>{i + 1}</td>
                  {cols.map((c) => (
                    <td key={c.k} className={td}>
                      {c.k === "gender" ? (
                        <select value={r.gender} onChange={(e) => up(i, { gender: e.target.value })} className={inp}><option value="" /><option>Nam</option><option>Nữ</option></select>
                      ) : (
                        <input value={r[c.k]} list={c.list} onChange={(e) => up(i, { [c.k]: e.target.value } as Partial<ResidentRow>)} className={`${inp} ${c.w} ${c.k === "room" ? "font-semibold" : ""}`} placeholder={c.k === "dob" ? "dd/mm/yyyy" : ""} />
                      )}
                    </td>
                  ))}
                  <td className={td}><button type="button" aria-label="Xóa dòng" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="px-1 text-gray-400 hover:text-red-600">✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id="res-rooms">{roomCodes.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm người</button>
        <span className="text-xs text-gray-500">{rows.length} người</span>
      </div>

      <details className="mt-3 rounded-xl bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-brand-800">Dán danh sách từ Excel</summary>
        <p className="my-2 text-xs text-gray-500">Trong Excel, bôi đen các ô (kể cả dòng tiêu đề) rồi Ctrl+C và dán vào ô dưới. Cột như sheet: STT, Phòng, Tên, CCCD, Nam, Nữ, Ngày sinh, Số điện thoại, Nghề nghiệp, Hộ khẩu, BKS xe, Loại xe màu, Liên hệ khẩn cấp. Ô Phòng bị gộp chỉ có ở dòng đầu thì các dòng sau tự lấy phòng ở trên. Người được thêm vào cuối danh sách, anh kiểm tra lại cột Phòng.</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className="w-full rounded-lg border border-gray-300 p-2 font-mono text-xs" placeholder="Dán bảng Excel vào đây" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={importPaste} className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Thêm vào danh sách</button>
          {note && <span className="text-sm text-gray-700">{note}</span>}
        </div>
      </details>
    </section>
  );
}
