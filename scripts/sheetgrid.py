"""Doc 3 kieu nguon (ods, xlsx, html) thanh luoi o co vi tri cot day du. Chi doc file tren may, khong ghi gi."""
import re, html, zipfile, sys
import xml.etree.ElementTree as ET

def _num_or_text(v):
    return v

def load_ods(path, maxcols=40):
    ns = {"t": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "x": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
          "o": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}
    T = "{%s}" % ns["t"]; O = "{%s}" % ns["o"]
    root = ET.fromstring(zipfile.ZipFile(path).read("content.xml"))
    out = {}
    for tb in root.iter(T + "table"):
        name = tb.get(T + "name").strip()
        grid = []
        for tr in tb.iter(T + "table-row"):
            rep = int(tr.get(T + "number-rows-repeated", "1"))
            cells = []
            for c in tr:
                if c.tag not in (T + "table-cell", T + "covered-table-cell"):
                    continue
                r = int(c.get(T + "number-columns-repeated", "1"))
                vt = c.get(O + "value-type")
                if vt in ("float", "currency", "percentage"):
                    v = float(c.get(O + "value"))
                else:
                    v = " ".join("".join(p.itertext()) for p in c.findall("x:p", ns)).strip()
                    if v == "":
                        v = None
                cells += [v] * min(r, maxcols)
            cells = cells[:maxcols]
            if rep > 50:
                continue
            for _ in range(rep):
                grid.append(cells)
        out[name] = grid
    return out

def load_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in wb:
        out[ws.title.strip()] = [list(r) for r in ws.iter_rows(values_only=True)]
    return out

def _to_num(s):
    t = s.replace("\u00a0", " ").strip()
    m = re.fullmatch(r"(-?)\s*([\d\.,]+)\s*đ?", t)
    if m and re.search(r"\d", m.group(2)):
        d = m.group(2)
        # kieu Viet: 1.234.567 ; kieu "1,0" (so thap phan) cho so nguoi
        if re.fullmatch(r"\d{1,3}(\.\d{3})+", d):
            return float((m.group(1) + d.replace(".", "")))
        if re.fullmatch(r"\d{1,3}(,\d{3})+", d):
            return float(m.group(1) + d.replace(",", ""))
        if re.fullmatch(r"\d+,\d+", d):
            return float(m.group(1) + d.replace(",", "."))
        if re.fullmatch(r"\d+(\.\d+)?", d):
            return float(m.group(1) + d)
    return s

def load_html_dir(folder):
    import os
    out = {}
    for f in os.listdir(folder):
        if not f.lower().endswith(".html"):
            continue
        s = open(os.path.join(folder, f), encoding="utf-8").read()
        s = re.sub(r"<style.*?</style>", "", s, flags=re.S)
        grid = []
        for r in re.findall(r"<tr.*?</tr>", s, flags=re.S):
            cells = []
            for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, flags=re.S):
                span = re.search(r'colspan="?(\d+)', c)
                v = html.unescape(re.sub(r"<.*?>", "", c)).strip()
                v = _to_num(v) if v else None
                cells += [v] + [None] * ((int(span.group(1)) - 1) if span else 0)
            grid.append(cells)
        out[f[:-5]] = grid
    return out

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
