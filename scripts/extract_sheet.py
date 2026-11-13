"""Đọc file Excel tải từ Google Sheet (tab T4-2026 ... T10-2026) -> data/import-sheet.json.
Cách dùng: python extract_sheet.py <file.xlsx> <out.json>
File JSON chứa dữ liệu tiền trọ, KHÔNG đưa lên GitHub (thư mục data/ đã bị bỏ qua)."""
import sys, json, re, datetime, openpyxl
sys.stdout.reconfigure(encoding="utf-8")
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
ROOMS = ["201", "202", "203", "301", "302", "303"]
COLS = [1, 2, 3, 4, 5, 6]  # cột B..G
MONTHS = list(range(4, 11))

def num(v):
    if v in (None, ""): return 0
    try: return float(v)
    except Exception: return 0

result = {"months": []}
warnings = []
for n in MONTHS:
    ws = [w for w in wb.worksheets if w.title.strip() == f"T{n}-2026"][0]
    rows = {r: row for r, row in enumerate(ws.iter_rows(min_row=1, max_row=30, max_col=9, values_only=True), 1)}
    def cell(r, c): return rows.get(r, [None]*9)[c]
    m = {"month": f"2026-{n:02d}", "tab": f"T{n}-2026", "rooms": []}
    for code, c in zip(ROOMS, COLS):
        total = round(num(cell(19, c)))
        rent = round(num(cell(17, c)))
        d = {
            "room": code,
            "elec_old": num(cell(2, c)), "elec_new": num(cell(3, c)), "elec_amount": round(num(cell(4, c))),
            "water_old": num(cell(6, c)), "water_new": num(cell(7, c)), "water_amount": round(num(cell(8, c))),
            "people": int(num(cell(10, c))),
            "service": round(num(cell(11, c))), "washer": round(num(cell(12, c))), "wifi": round(num(cell(13, c))),
            "rent": rent, "adjust": round(num(cell(18, c))), "total": total,
        }
        per = cell(23, c)
        mm = re.match(r"\s*(\d{1,2})/(\d{1,2})", str(per or ""))
        d["period"] = str(per or "").strip()
        d["due"] = f"2026-{int(mm.group(2)):02d}-{int(mm.group(1)):02d}" if mm else None
        parts = d["rent"] + d["elec_amount"] + d["water_amount"] + d["service"] + d["washer"] + d["wifi"] + d["adjust"]
        d["lines_sum"] = parts
        d["diff"] = total - parts
        if total != parts:
            warnings.append(f"T{n} phòng {code}: tổng sheet {total:,} khác tổng các khoản {parts:,} (lệch {total-parts:,})")
        m["rooms"].append(d)
    result["months"].append(m)
result["warnings"] = warnings
json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("OK ->", out)
for m in result["months"]:
    t = sum(r["total"] for r in m["rooms"])
    print(m["month"], "tổng sheet:", f"{t:,}", "| phòng có hóa đơn:", sum(1 for r in m["rooms"] if r["total"] > 0))
print("CẢNH BÁO:", *warnings, sep="\n  ") if warnings else print("Không có lệch tổng")
