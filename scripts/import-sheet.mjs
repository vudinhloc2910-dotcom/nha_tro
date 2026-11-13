// Nạp dữ liệu T4-T10 2026 từ data/import-sheet.json vào database.
// Chạy trên máy:   node scripts/import-sheet.mjs
// Chạy vào Turso:  đặt biến TURSO_DATABASE_URL và TURSO_AUTH_TOKEN rồi chạy cùng lệnh.
// Thêm --dry để chỉ kiểm tra, không ghi. An toàn chạy lại nhiều lần (hóa đơn đã nhập sẽ được thay mới).
import { createClient } from "@libsql/client";
import crypto from "node:crypto";
import fs from "node:fs";

const DRY = process.argv.includes("--dry");
const data = JSON.parse(fs.readFileSync("data/import-sheet.json", "utf8"));

const remote = process.env.TURSO_DATABASE_URL?.trim();
const c = remote
  ? createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN?.trim() })
  : createClient({ url: "file:data/nhatro.db" });
console.log("Database:", remote ? "Turso (" + remote.replace(/^libsql:\/\//, "") + ")" : "file trên máy data/nhatro.db");
if (DRY) console.log("CHẾ ĐỘ THỬ (--dry): không ghi gì");

const vnd = (n) => Math.round(n).toLocaleString("vi-VN") + " đ";
const one = async (sql, args = []) => (await c.execute({ sql, args })).rows[0];

// Bảo đảm database đã có bảng (khi chạy lần đầu trên máy)
const hasRooms = await c.execute("SELECT name FROM sqlite_master WHERE name='invoices'");
if (!hasRooms.rows.length) {
  console.error("Database chưa có bảng. Hãy chạy web 1 lần (npm run dev, mở trang đăng nhập rồi đăng nhập) để tạo bảng, rồi chạy lại.");
  process.exit(1);
}
const cols = await c.execute("SELECT name FROM pragma_table_info('invoices')");
if (!cols.rows.some((r) => r.name === "locked")) {
  if (!DRY) await c.execute("ALTER TABLE invoices ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
}

const latest = data.months[data.months.length - 1];
const stmts = [];
let invCount = 0, payCount = 0;
const report = [];

// Cài đặt theo giá thực tế trong sheet (giá điện/nước/dịch vụ hiện hành)
for (const [k, v] of Object.entries({ elec_price: "4000", water_mode: "meter", water_price: "35000" })) {
  stmts.push({ sql: "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [k, v] });
}
stmts.push({ sql: "DELETE FROM services", args: [] });
for (const [name, type, price] of [["Wifi", "room", 100000], ["Vệ sinh, rác, điện chung, sạc xe", "person", 50000], ["Máy giặt", "person", 50000]]) {
  stmts.push({ sql: "INSERT INTO services(name,type,price) VALUES (?,?,?)", args: [name, type, price] });
}

for (const m of data.months) {
  const isLatest = m === latest;
  for (const d of m.rooms) {
    if (!(d.total > 0)) continue;
    const room = await one("SELECT id, code FROM rooms WHERE code=?", [d.room]);
    if (!room) { report.push(`Bỏ qua: không có phòng ${d.room}`); continue; }
    const tenant = await one("SELECT name FROM tenants WHERE room_id=? AND active=1", [room.id]);
    const lines = [];
    if (d.rent) lines.push(["Tiền phòng", `Kỳ ${d.period || ""}`.trim(), d.rent]);
    if (d.elec_new || d.elec_old || d.elec_amount) {
      const kwh = d.elec_new - d.elec_old;
      lines.push(["Tiền điện", kwh > 0 ? `${d.elec_old} → ${d.elec_new} = ${kwh} kWh × ${vnd(d.elec_amount / kwh)}` : `${d.elec_old} → ${d.elec_new}`, d.elec_amount]);
    }
    if (d.water_new || d.water_old || d.water_amount) {
      const m3 = d.water_new - d.water_old;
      lines.push(["Tiền nước", m3 > 0 ? `${d.water_old} → ${d.water_new} = ${m3} m³ × ${vnd(d.water_amount / m3)}` : `${d.water_old} → ${d.water_new}`, d.water_amount]);
    }
    if (d.service) lines.push(["Vệ sinh, rác, điện chung, sạc xe", d.people ? `${d.people} người` : "", d.service]);
    if (d.washer) lines.push(["Máy giặt", "", d.washer]);
    if (d.wifi) lines.push(["Wifi", "", d.wifi]);
    if (d.adjust) lines.push(["Giảm tiền phòng / nợ cũ", "Theo sheet", d.adjust]);
    const sum = lines.reduce((a, l) => a + l[2], 0);
    if (sum !== d.total) {
      lines.push(["Điều chỉnh (theo tổng trong sheet)", "Sheet tính tổng khác tổng các dòng", d.total - sum]);
      report.push(`${m.month} phòng ${d.room}: điều chỉnh ${vnd(d.total - sum)} để khớp tổng sheet ${vnd(d.total)}`);
    }
    const due = d.due || `${m.month}-15`;
    const old = await one("SELECT id, token FROM invoices WHERE room_id=? AND month=?", [room.id, m.month]);
    const token = old?.token || crypto.randomBytes(12).toString("hex");
    const hasId = !!old;
    // Nếu đã có hóa đơn tháng đó thì thay mới (giữ link khách đã gửi)
    if (hasId) {
      stmts.push({ sql: "DELETE FROM payments WHERE invoice_id=?", args: [old.id] });
      stmts.push({ sql: "DELETE FROM invoice_lines WHERE invoice_id=?", args: [old.id] });
      stmts.push({ sql: "UPDATE invoices SET tenant_name=?, people=?, prev_debt=0, total=?, due_date=?, locked=1 WHERE id=?",
        args: [tenant?.name ?? "", d.people || 1, d.total, due, old.id] });
    } else {
      stmts.push({ sql: "INSERT INTO invoices(room_id,month,tenant_name,people,prev_debt,total,due_date,token,locked) VALUES (?,?,?,?,0,?,?,?,1)",
        args: [room.id, m.month, tenant?.name ?? "", d.people || 1, d.total, due, token] });
    }
    const idExpr = hasId ? old.id : null;
    for (const [label, detail, amount] of lines) {
      stmts.push({
        sql: hasId
          ? "INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES (?,?,?,?)"
          : "INSERT INTO invoice_lines(invoice_id,label,detail,amount) VALUES ((SELECT id FROM invoices WHERE room_id=? AND month=?),?,?,?)",
        args: hasId ? [idExpr, label, detail, amount] : [room.id, m.month, label, detail, amount],
      });
    }
    // Mặc định: T4..T9 đã thu đủ, T10 (mới nhất) chưa thu
    if (!isLatest) {
      stmts.push({
        sql: hasId
          ? "INSERT INTO payments(invoice_id,amount,method,paid_at,note) VALUES (?,?,?,?,?)"
          : "INSERT INTO payments(invoice_id,amount,method,paid_at,note) VALUES ((SELECT id FROM invoices WHERE room_id=? AND month=?),?,?,?,?)",
        args: hasId
          ? [idExpr, d.total, "bank", due, "Mặc định: đã thu (nhập từ sheet)"]
          : [room.id, m.month, d.total, "bank", due, "Mặc định: đã thu (nhập từ sheet)"],
      });
      payCount++;
    }
    // Chỉ số điện nước để tháng sau lấy số cũ
    stmts.push({
      sql: `INSERT INTO readings(room_id,month,elec_old,elec_new,water_old,water_new) VALUES (?,?,?,?,?,?)
            ON CONFLICT(room_id,month) DO UPDATE SET elec_old=excluded.elec_old, elec_new=excluded.elec_new, water_old=excluded.water_old, water_new=excluded.water_new`,
      args: [room.id, m.month, d.elec_old, d.elec_new, d.water_old, d.water_new],
    });
    invCount++;
  }
}

// Phòng/khách theo tháng mới nhất: giá thuê, số người
for (const d of latest.rooms) {
  if (d.total > 0) {
    stmts.push({ sql: "UPDATE rooms SET rent=? WHERE code=?", args: [d.rent, d.room] });
    stmts.push({ sql: "UPDATE tenants SET people=? WHERE active=1 AND room_id=(SELECT id FROM rooms WHERE code=?)", args: [d.people || 1, d.room] });
  }
}

console.log(`Sẽ nạp: ${invCount} hóa đơn, ${payCount} khoản thu mặc định, ${stmts.length} lệnh.`);
if (report.length) console.log("Điều chỉnh để khớp sheet:\n  " + report.join("\n  "));
if (DRY) process.exit(0);
await c.batch(stmts, "write");
console.log("Xong.");
const n = await one("SELECT COUNT(*) c, SUM(total) t FROM invoices");
console.log(`Trong database hiện có ${n.c} hóa đơn, tổng ${vnd(n.t)}.`);
