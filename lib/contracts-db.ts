import { all, batch, one, run } from "./db";
import type { Contract, ContractEvent } from "./contracts";

/** Khách có "Hợp đồng đến ngày" thì giữ hợp đồng khớp với ô đó (tạo mới nếu chưa có). */
export async function syncContractFromTenant(tenantId: number, roomId: number, moveIn: string, end: string, deposit: number) {
  if (!end) return;
  const cur = await one<{ id: number }>("SELECT id FROM contracts WHERE tenant_id=? AND status='active' ORDER BY id DESC LIMIT 1", tenantId);
  if (cur) {
    await run("UPDATE contracts SET end_date=?, deposit=? WHERE id=?", end, deposit, cur.id);
    return;
  }
  const room = await one<{ rent: number }>("SELECT rent FROM rooms WHERE id=?", roomId);
  await run(
    "INSERT INTO contracts(room_id,tenant_id,start_date,end_date,handover_date,notice_days,rent,deposit,status,note,created) VALUES (?,?,?,?,?,30,?,?,'active','',date('now'))",
    roomId, tenantId, moveIn, end, moveIn, room?.rent ?? 0, deposit
  );
}

/** Khách trả phòng thì hợp đồng đang hiệu lực được đóng lại và ghi một dòng "Chấm dứt" trong lịch sử. */
export async function closeContractsOnCheckout(roomId: number, date: string) {
  const open = await all<{ id: number; end_date: string }>("SELECT id, end_date FROM contracts WHERE room_id=? AND status='active'", roomId);
  if (!open.length) return;
  await batch(open.flatMap((c) => [
    { sql: "UPDATE contracts SET status='terminated' WHERE id=?", args: [c.id] },
    { sql: "INSERT INTO contract_events(contract_id,kind,event_date,detail,old_end,new_end,created) VALUES (?,?,?,?,?,?,?)", args: [c.id, "terminate", date, "Khách trả phòng", c.end_date, date, new Date().toISOString()] },
  ]));
}

/** Hợp đồng của một phòng: đang hiệu lực (nếu có), các hợp đồng cũ và lịch sử sự kiện. */
export async function loadRoomContracts(roomId: number) {
  const contracts = await all<Contract & { tenant_name: string | null }>(
    `SELECT c.*, t.name tenant_name FROM contracts c LEFT JOIN tenants t ON t.id=c.tenant_id WHERE c.room_id=? ORDER BY c.id DESC`, roomId);
  const events = await all<ContractEvent>(
    `SELECT e.* FROM contract_events e WHERE e.contract_id IN (SELECT id FROM contracts WHERE room_id=?) ORDER BY e.event_date DESC, e.id DESC`, roomId);
  return { active: contracts.find((c) => c.status === "active") ?? null, contracts, events };
}
