export { MonthPicker } from "./month-picker";
import { STATUS_CLASS, STATUS_LABEL, type Status } from "@/lib/format";

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  return (
    <>
      {ok && <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}
      {err && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
    </>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}
