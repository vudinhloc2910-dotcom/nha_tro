"""
Doc sheet cu cua 3 nha -> file JSON de nap vao web (Khac -> Nhap du lieu).
Dung:  python -I scripts/extract_houses.py <thu muc raw> <xlsx Tan Khai>
Chi DOC file, khong ghi len mang. Ket qua nam trong data/ (da .gitignore, chua so lieu thu chi nen khong dua len GitHub).
"""
import json, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sheetgrid as sg

sys.stdout.reconfigure(encoding="utf-8")


def unacc(s):
    s = unicodedata.normalize("NFD", str(s)).replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def key(s):
    return re.sub(r"\s+", " ", unacc(s).upper()).strip()


def isnum(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def label_of(row, maxc=5):
    for j, v in enumerate(row[:maxc]):
        if isinstance(v, str) and v.strip() and not re.fullmatch(r"[\d\.]+", v.strip()):
            return j, v.strip()
    return None, ""


# ---------------------------------------------------------------- 1 tab -> 1 thang
ROW_KEYS = [  # (khoa, bat dau bang) -- thu tu quan trong
    ("elec_old", "DIEN CU"), ("elec_new", "DIEN MOI"), ("elec_amount", "TIEN DIEN"),
    ("water_old", "NUOC CU"), ("water_new", "NUOC MOI"), ("water_amount", "TIEN NUOC"),
    ("people", "SO NGUOI"), ("service", "VE SINH"), ("service", "PHI DICH VU"), ("washer", "MAY GIAT"),
    ("wifi", "WIFI"), ("rent", "TIEN PHONG"), ("adjust", "GIAM TIEN PHONG"), ("total", "TONG CAN NOP"),
    ("paid_row", "DA THANH TOAN"), ("status", "TINH TRANG THU"), ("period", "KI HAN"), ("period", "KY HAN"),
]


def parse_period(txt, month):
    """'30/10-30/11' hoac '30/10-30/11/2026' -> han dong 'YYYY-MM-DD' (ngay cuoi cua ky)."""
    m = re.findall(r"(\d{1,2})/(\d{1,2})", str(txt))
    if len(m) < 2:
        return None
    d, mo = int(m[-1][0]), int(m[-1][1])
    y, mm = int(month[:4]), int(month[5:7])
    year = y + (1 if mo < mm else 0)
    return f"{year:04d}-{mo:02d}-{d:02d}"


def parse_tab(grid, month):
    hdr = None
    for i, row in enumerate(grid[:6]):
        codes = {}
        for j, v in enumerate(row):
            s = str(int(v)) if isnum(v) else (v.strip() if isinstance(v, str) else "")
            if re.fullmatch(r"[1-4]0\d", s):
                codes[j] = s
        if len(codes) >= 3:
            hdr = (i, codes)
            break
    if not hdr:
        return None
    hi, cols = hdr
    rooms = {c: {"room": c, "elec_old": 0, "elec_new": 0, "elec_amount": 0, "water_old": 0, "water_new": 0,
                 "water_amount": 0, "people": 0, "service": 0, "washer": 0, "wifi": 0, "rent": 0, "adjust": 0,
                 "total": 0, "period": "", "due": None, "paid": None, "status_paid": False} for c in cols.values()}
    seen = set()
    stop_at = None
    for i in range(hi + 1, len(grid)):
        row = grid[i]
        j, lab = label_of(row)
        if not lab:
            continue
        k = key(lab)
        if k.startswith("CHI PHI PHAT SINH") or k.startswith("TONG THU"):
            stop_at = i
            break
        if k.startswith("TONG DICH VU"):
            continue
        for field, pref in ROW_KEYS:
            if k.startswith(pref):
                if field in seen:
                    break
                seen.add(field)
                for cj, code in cols.items():
                    v = row[cj] if cj < len(row) else None
                    r = rooms[code]
                    if field == "paid_row":
                        if isnum(v) and v > 0:
                            r["paid"] = float(v)
                    elif field == "status":
                        if isinstance(v, str) and "da thanh toan" in key(v).lower():
                            r["status_paid"] = True
                    elif field == "period":
                        if v:
                            r["period"] = str(v)[:40]
                            r["due"] = parse_period(v, month)
                    elif isnum(v):
                        r[field] = float(v)
                break
    bank = None
    for row in grid:
        for v in row:
            if isinstance(v, str):
                b = parse_bank(v)
                if b:
                    bank = b
    return {"rooms": rooms, "bank": bank, "after": stop_at or len(grid)}


BANKS = {"TECHCOMBANK": "TCB", "TPBANK": "TPB", "MBBANK": "MB", "VIETCOMBANK": "VCB", "VIETINBANK": "ICB",
         "BIDV": "BIDV", "VPBANK": "VPB", "ACB": "ACB"}


def parse_bank(txt):
    t = re.sub(r"\(.*?\)", "", txt)
    m = re.search(r"(\d[\d\.\s]{6,}\d)\s*[-–]?\s*(techcombank|tpbank|mb ?bank|vietcombank|vietinbank|bidv|vpbank|acb)\s*[-–]?\s*([^\d]+?)\s*$", t, re.I)
    if not m:
        return None
    acc = re.sub(r"[^\d]", "", m.group(1))
    name = re.sub(r"\s+", "", m.group(2).upper())
    holder = re.sub(r"\s+", " ", unacc(m.group(3)).upper()).strip(" -")
    return {"code": BANKS.get(name, name), "account": acc, "holder": holder}


# ---------------------------------------------------------------- so thu chi cuoi tab
CAT_NAME = {"dien": "Tiền điện (trả nhà cung cấp)", "nuoc": "Tiền nước (trả nhà cung cấp)", "mang": "Tiền mạng",
            "dich_vu": "Dịch vụ (chi thực tế)", "tien_phong": "Tiền thuê nhà (trả chủ nhà)"}


def parse_ledger(grid, start):
    out, info = [], {}
    items = []
    hr = next((i for i in range(max(0, start - 2), len(grid)) if any(isinstance(v, str) and key(v).startswith("TEN HANG MUC") for v in grid[i])), None)
    if hr is not None:
        row = grid[hr]
        name_c = next(j for j, v in enumerate(row) if isinstance(v, str) and key(v).startswith("TEN HANG MUC"))
        amt_c = next((j for j, v in enumerate(row) if isinstance(v, str) and key(v).startswith("THANH TIEN") and j > name_c), None)
        price_c = next((j for j, v in enumerate(row) if isinstance(v, str) and key(v).startswith("DON GIA") and j > name_c), None)
        for i in range(hr + 1, min(len(grid), hr + 20)):
            r = grid[i]
            nm = r[name_c] if name_c < len(r) else None
            if isinstance(nm, str) and key(nm) == "TONG":
                break
            if not (isinstance(nm, str) and nm.strip() and not re.fullmatch(r"[\d\.\s]+", nm)):
                continue
            amt = None
            for c in (amt_c, price_c):
                if c is not None and c < len(r) and isnum(r[c]) and r[c] != 0:
                    amt = r[c]
                    break
            if amt is None:
                for c in range(name_c + 1, (amt_c or name_c + 4) + 1):
                    if c < len(r) and isnum(r[c]) and r[c] > 1000:
                        amt = r[c]
                        break
            if amt:
                items.append((nm.strip(), float(amt)))
    sr = next((i for i, r in enumerate(grid)
               if any(isinstance(v, str) and key(v) == "TONG THU" for v in r) and any(isinstance(v, str) and key(v) == "TONG CHI" for v in r)), None)
    cats = {"DIEN": "dien", "NUOC": "nuoc", "MANG": "mang", "DICH VU": "dich_vu", "TIEN PHONG": "tien_phong"}
    summ_pc = None
    if sr is not None:
        row = grid[sr]
        thu_c = next(j for j, v in enumerate(row) if isinstance(v, str) and key(v) == "TONG THU")
        chi_c = next(j for j, v in enumerate(row) if isinstance(v, str) and key(v) == "TONG CHI")
        for i in range(sr + 1, min(len(grid), sr + 12)):
            r = grid[i]
            j, lab = label_of(r, 5)
            if not lab:
                continue
            k = key(lab)
            thu = r[thu_c] if thu_c < len(r) and isnum(r[thu_c]) else None
            chi = r[chi_c] if chi_c < len(r) and isnum(r[chi_c]) else None
            if k in cats and chi:
                out.append({"kind": "chi", "category": cats[k], "name": CAT_NAME[cats[k]], "amount": float(chi)})
            elif k.startswith("MOI") and thu:
                out.append({"kind": "thu", "category": "phong_moi", "name": "Thu tiền phòng mới (cọc, tháng đầu)", "amount": float(thu)})
            elif k.startswith("CHI PHI PHAT SINH") and chi:
                summ_pc = float(chi)
            elif k == "TONG":
                info["sheet_thu"] = float(thu) if thu is not None else None
                info["sheet_chi"] = float(chi) if chi is not None else None
        # Tan Khai: luong quan ly nam o bang "Loi nhuan"
        for i in range(sr, min(len(grid), sr + 14)):
            r = grid[i]
            lc = next((j for j, v in enumerate(r) if isinstance(v, str) and key(v).startswith("LUONG QUAN LY")), None)
            if lc is not None:
                for ii in range(i + 1, min(len(grid), i + 4)):
                    v = grid[ii][lc] if lc < len(grid[ii]) else None
                    if isnum(v) and v > 0:
                        out.append({"kind": "chi", "category": "luong", "name": "Lương quản lý", "amount": float(v)})
                        break
                break
    total_items = 0.0
    for nm, amt in items:
        k = key(nm)
        cat = "luong" if "LUONG" in k else ("dau_tu" if ("DAU TU" in k or "SET UP" in k) else "phat_sinh")
        out.append({"kind": "chi", "category": cat, "name": nm, "amount": amt})
        total_items += amt
    if summ_pc is not None and abs(summ_pc - total_items) > 0.5:
        out.append({"kind": "chi", "category": "phat_sinh", "name": "Khác (theo tổng trong sheet)", "amount": summ_pc - total_items})
    return out, info


def tab_month(name):
    m = re.fullmatch(r"\s*T(\d{1,2})-(\d{4})\s*", name)
    if m:
        return f"{int(m.group(2)):04d}-{int(m.group(1)):02d}"
    m = re.fullmatch(r"\s*Th.ng\s*(\d{1,2})(\d{4})\s*", name)
    if m:
        return f"{int(m.group(2)):04d}-{int(m.group(1)):02d}"
    return None


def build(grids, house, cfg):
    months = []
    bank = None
    for name, grid in grids.items():
        month = tab_month(name)
        if not month:
            continue
        t = parse_tab(grid, month)
        if not t:
            continue
        ledger, info = parse_ledger(grid, t["after"])
        rooms = []
        for r in t["rooms"].values():
            if r["total"] <= 0 and r["rent"] <= 0:
                continue
            sp = r.pop("status_paid")
            if not r["paid"] and sp:
                r["paid"] = r["total"]
            rooms.append(r)
        if not rooms:
            continue
        months.append({"month": month, "rooms": rooms, "ledger": ledger, **info})
        if t["bank"] and (not bank or month >= bank[0]):
            bank = (month, t["bank"])
    months.sort(key=lambda m: m["month"])
    # Tab "ban nhap": thang moi chep nguyen tu thang truoc (cung chi so dien o moi phong) -> bo, vi chua nhap so moi
    kept = []
    for m in months:
        if kept:
            prev = {r["room"]: (r["elec_old"], r["elec_new"]) for r in kept[-1]["rooms"]}
            cur = {r["room"]: (r["elec_old"], r["elec_new"]) for r in m["rooms"]}
            if cur == prev:
                print(f"  [bo qua] {house} thang {m['month']}: giong het thang truoc (chua nhap chi so moi)")
                continue
        kept.append(m)
    months = kept
    # Mot so tab de trong o "DIEN CU" (cong thuc mat): lay so moi cua thang truoc lam so cu
    last_new = {}
    for m in months:
        for r in m["rooms"]:
            if r["elec_old"] == 0 and r["elec_new"] > 0 and r["room"] in last_new and last_new[r["room"]] <= r["elec_new"]:
                r["elec_old"] = last_new[r["room"]]
            if r["elec_new"] > 0:
                last_new[r["room"]] = r["elec_new"]
    latest = months[-1]
    ratios = sorted(round(r["elec_amount"] / (r["elec_new"] - r["elec_old"]))
                    for r in latest["rooms"] if r["elec_new"] > r["elec_old"] and r["elec_amount"] > 0)
    elec = ratios[len(ratios) // 2] if ratios else 3500
    return {"house": house, "bank": bank[1] if bank else None, "settings": {"elec_price": elec, **cfg}, "months": months}


def main(raw, tk_xlsx):
    os.makedirs("data", exist_ok=True)
    jobs = [
        ("272 Mậu Lương", lambda: sg.load_ods(os.path.join(raw, "272 Mậu Lương.ods")), "mauluong272",
         {"water_mode": "meter", "water_price": 35000, "rent_cost_monthly": 17800000, "partners": "Tài:50, Lộc:50",
          "services": [["Wifi", "room", 100000], ["Vệ sinh, rác, điện chung, sạc xe", "person", 50000], ["Máy giặt", "person", 50000]]}),
        ("8A Giải Phóng", lambda: sg.load_html_dir(os.path.join(raw, "8A Giải Phóng")), "8a-giaiphong",
         {"water_mode": "person", "water_price": 100000, "rent_cost_monthly": 14500000, "manager_salary": 1000000, "partners": "Tài:50, Lộc:50",
          "services": [["Wifi", "room", 100000], ["Vệ sinh, rác, điện chung", "person", 50000], ["Máy giặt", "person", 50000]]}),
        ("Tân Khai (ngõ 150/82)", lambda: sg.load_xlsx(tk_xlsx), "tan-khai",
         {"water_mode": "person", "water_price": 100000, "rent_cost_monthly": 0, "manager_salary": 1000000, "partners": "Tài:50, Lộc:50",
          "services": [["Wifi", "room", 100000], ["Phí dịch vụ", "person", 50000]]}),
    ]
    for house, loader, slug, cfg in jobs:
        data = build(loader(), house, cfg)
        path = f"data/import-{slug}.json"
        json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        ms = data["months"]
        tot = sum(r["total"] for m in ms for r in m["rooms"])
        print(f"{house}: {len(ms)} thang {ms[0]['month']}..{ms[-1]['month']}, dien={data['settings']['elec_price']}, "
              f"bank={(data['bank'] or {}).get('code')}, tong hoa don={tot:,.0f} -> {path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
