"use client";

import { useEffect, useMemo, useState } from "react";
import { saveResidents, type ResidentRow } from "./actions";
import { StatusText, useAutosave } from "./use-autosave";

type Person = Omit<ResidentRow, "room">;
type Group = { room: string; people: Person[] };

const EMPTY: Person = { name: "", cccd: "", gender: "", dob: "", phone: "", job: "", address: "", plate: "", vehicle: "", emergency: "" };

// Ô nhìn như chữ thường, chỉ hiện khung khi rê chuột hoặc đang gõ (giống bảng Khách thuê ở trên cho đỡ rối mắt)
const cellInp = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-gray-900 hover:border-gray-300 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-600";
const th = "sticky top-0 z-10 whitespace-nowrap border-b border-gray-200 bg-white px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 shadow-[0_1px_0_0_#e5e7eb]";
const td = "border-b border-gray-100 px-0.5 py-0.5 align-middle";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

/** Gom các dòng cùng số phòng thành một nhóm: mỗi phòng chỉ hiện số phòng một lần, các người ở xếp bên dưới. */
function toGroups(rows: ResidentRow[]): Group[] {
  const gs: Group[] = [];
  for (const { room, ...p } of rows) {
    const g = gs.find((x) => x.room === room && room !== "");
    if (g) g.people.push(p);
    else gs.push({ room, people: [p] });
  }
  return gs;
}
const flatten = (gs: Group[]): ResidentRow[] => gs.flatMap((g) => g.people.map((p) => ({ room: g.room, ...p })));

/** Đọc bảng dán từ Excel (cột như sheet: STT, Phòng, Tên, CCCD, Nam, Nữ, Ngày sinh, SĐT, Nghề nghiệp, Hộ khẩu, BKS xe, Loại xe màu, Liên hệ khẩn cấp). */
function parsePaste(text: string): ResidentRow[] {
  let rows = text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return [];
  let col: Record<string, number> = { stt: 0, room: 1, name: 2, cccd: 3, nam: 4, nu: 5, dob: 6, phone: 7, job: 8, address: 9, plate: 10, vehicle: 11, emergency: 12 };
  // Tìm dòng tiêu đề trong vài dòng đầu (có thể có dòng tên bảng "DANH SÁCH NGƯỜI Ở..." phía trên) rồi bỏ nó và mọi dòng trước nó
  const hi = rows.slice(0, 6).findIndex((r) => r.filter(Boolean).length >= 3 && r.some((c) => /cccd|cmnd|can cuoc/.test(norm(c))));
  if (hi >= 0) {
    col = {};
    rows[hi].forEach((c, i) => {
      const n = norm(c);
      if (n === "stt") col.stt = i;
      else if (/phong/.test(n)) col.room = i; // "Phòng", "Tên phòng", "Số phòng"
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
    rows = rows.slice(hi + 1);
  }
  const get = (r: string[], k: string) => (col[k] === undefined ? "" : (r[col[k]] ?? ""));
  const out: ResidentRow[] = [];
  let room = "";
  for (const r of rows) {
    const name = get(r, "name");
    if (/^(ten|ho ten|ho va ten)$/.test(norm(name))) continue; // dòng tiêu đề lặp lại
    const rm = get(r, "room");
    if (rm) room = rm; // ô phòng gộp trong Excel chỉ có ở dòng đầu: các dòng sau lấy phòng ở trên
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

/** Danh sách người ở từng phòng: mỗi phòng một khối, nhiều người ở chung một số phòng. Sửa trực tiếp, tự lưu khi rời ô. */
export function ResidentsTable({ initial, roomCodes }: { initial: ResidentRow[]; roomCodes: string[] }) {
  const [groups, setGroups] = useState<Group[]>(() => toGroups(initial));
  const [status, setStatus] = useState("");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const flat = useMemo(() => flatten(groups), [groups]);
  const auto = useAutosave(flat, (v) => saveResidents(v), setStatus);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (auto.dirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [auto]);

  const setRoom = (gi: number, room: string) => setGroups((g) => g.map((x, i) => (i === gi ? { ...x, room } : x)));
  const setPerson = (gi: number, pi: number, p: Partial<Person>) =>
    setGroups((g) => g.map((x, i) => (i === gi ? { ...x, people: x.people.map((y, j) => (j === pi ? { ...y, ...p } : y)) } : x)));
  const addPerson = (gi: number) => setGroups((g) => g.map((x, i) => (i === gi ? { ...x, people: [...x.people, { ...EMPTY }] } : x)));
  const removePerson = (gi: number, pi: number) =>
    setGroups((g) => g.map((x, i) => (i === gi ? { ...x, people: x.people.filter((_, j) => j !== pi) } : x)).filter((x) => x.people.length > 0));
  const addRoom = () => setGroups((g) => [...g, { room: "", people: [{ ...EMPTY }] }]);

  const importPaste = () => {
    const added = parsePaste(paste);
    if (!added.length) { setNote("Không đọc được dòng nào. Hãy copy cả các ô từ Excel (có cột Tên) rồi dán vào."); return; }
    setGroups((g) => {
      const next = g.map((x) => ({ ...x, people: [...x.people] }));
      for (const { room, ...p } of added) {
        const t = next.find((x) => x.room === room && room !== "");
        if (t) t.people.push(p); // phòng đã có thì xếp thêm người vào phòng đó
        else next.push({ room, people: [p] });
      }
      return next;
    });
    setPaste("");
    setNote(`Đã thêm ${added.length} người. Kiểm tra lại cột Phòng rồi sửa nếu cần.`);
  };

  const cols: { k: keyof Person; label: string; w: string }[] = [
    { k: "name", label: "Họ và tên", w: "min-w-[10rem]" },
    { k: "cccd", label: "CCCD", w: "min-w-[8.5rem]" },
    { k: "gender", label: "Giới tính", w: "w-16" },
    { k: "dob", label: "Ngày sinh", w: "min-w-[6.5rem]" },
    { k: "phone", label: "Số điện thoại", w: "min-w-[7.5rem]" },
    { k: "job", label: "Nghề nghiệp", w: "min-w-[6.5rem]" },
    { k: "address", label: "Hộ khẩu thường trú", w: "min-w-[16rem]" },
    { k: "plate", label: "Biển số xe", w: "min-w-[7rem]" },
    { k: "vehicle", label: "Loại xe, màu", w: "min-w-[7.5rem]" },
    { k: "emergency", label: "Liên hệ khẩn cấp", w: "min-w-[8.5rem]" },
  ];
  const total = flat.length;

  return (
    <section onBlur={auto.flush} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Danh sách người ở</h2>
          <p className="text-xs text-gray-500">{groups.length} phòng · {total} người. Mỗi phòng một khối, nhiều người ở chung số phòng. Gõ trực tiếp vào ô, tự lưu khi rời ô.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusText t={status} />
          <a href="/residents-export" className="rounded-xl border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Tải Excel (CSV)</a>
          <button type="button" onClick={auto.flush} className="rounded-xl border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">Lưu ngay</button>
        </div>
      </div>

      <div data-nav-scope className="max-h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-20 min-w-[7.5rem] bg-white`}>Phòng</th>
              {cols.map((c) => <th key={c.k} className={th}>{c.label}</th>)}
              <th className={`${th} w-8`} />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={cols.length + 2} className="px-3 py-8 text-center text-sm text-gray-500">Chưa có người ở nào. Bấm &quot;+ Thêm phòng&quot; hoặc dán bảng từ Excel bên dưới.</td></tr>}
            {groups.map((g, gi) =>
              g.people.map((p, pi) => (
                <tr key={`${gi}-${pi}`} className={`${gi % 2 ? "bg-gray-50/60" : "bg-white"} ${pi === 0 ? "border-t-2 border-t-gray-200" : ""} hover:bg-brand-50/40`}>
                  {pi === 0 && (
                    <td rowSpan={g.people.length} className="sticky left-0 z-10 border-b border-r border-gray-200 bg-inherit px-1.5 py-1 align-top">
                      <input value={g.room} list="res-rooms" onChange={(e) => setRoom(gi, e.target.value)} placeholder="Số phòng" className={`${cellInp} min-w-[5.5rem] text-base font-bold text-brand-800`} />
                      <button type="button" onClick={() => addPerson(gi)} className="ml-1.5 mt-1 whitespace-nowrap text-xs font-medium text-brand-700 hover:underline">+ Thêm người</button>
                    </td>
                  )}
                  {cols.map((c) => (
                    <td key={c.k} className={td}>
                      {c.k === "gender" ? (
                        <select value={p.gender} onChange={(e) => setPerson(gi, pi, { gender: e.target.value })} className={`${cellInp} ${c.w} cursor-pointer appearance-none`} aria-label="Giới tính">
                          <option value="">—</option><option>Nam</option><option>Nữ</option>
                        </select>
                      ) : (
                        <input value={p[c.k]} onChange={(e) => setPerson(gi, pi, { [c.k]: e.target.value } as Partial<Person>)} className={`${cellInp} ${c.w} ${c.k === "name" ? "font-medium" : ""}`} placeholder={c.k === "dob" ? "dd/mm/yyyy" : ""} />
                      )}
                    </td>
                  ))}
                  <td className={td}><button type="button" aria-label="Xóa người này" title="Xóa người này" onClick={() => removePerson(gi, pi)} className="px-1.5 text-gray-300 hover:text-red-600">✕</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <datalist id="res-rooms">{roomCodes.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRoom} className="text-sm font-medium text-brand-700 hover:underline">+ Thêm phòng</button>
      </div>

      <details className="mt-3 rounded-xl bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-brand-800">Dán danh sách từ Excel</summary>
        <p className="my-2 text-xs text-gray-500">Trong Excel, bôi đen các ô (kể cả dòng tiêu đề) rồi Ctrl+C và dán vào ô dưới. Em tự bỏ dòng tên bảng và dòng tiêu đề, gom người cùng phòng vào một khối. Ô Phòng bị gộp chỉ có ở dòng đầu thì các dòng sau tự lấy phòng ở trên. Anh kiểm tra lại cột Phòng sau khi dán.</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className="w-full rounded-lg border border-gray-300 p-2 font-mono text-xs" placeholder="Dán bảng Excel vào đây" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={importPaste} className="rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Thêm vào danh sách</button>
          {note && <span className="text-sm text-gray-700">{note}</span>}
        </div>
      </details>
    </section>
  );
}
