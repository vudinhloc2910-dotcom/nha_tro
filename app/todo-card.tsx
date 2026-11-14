import Link from "next/link";
import type { Todo } from "@/lib/todos";

/** Thẻ "Việc cần làm": các bước để một nhà sẵn sàng thu tiền. Làm xong hết thì tự ẩn. */
export function TodoCard({ houseName, todos }: { houseName: string; todos: Todo[] }) {
  const left = todos.filter((t) => !t.done);
  if (left.length === 0) return null;
  const done = todos.length - left.length;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-amber-900">Việc cần làm · {houseName}</h2>
          <p className="text-xs text-amber-800">Hoàn thành {done}/{todos.length} bước để nhà này sẵn sàng thu tiền</p>
        </div>
        <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(done / todos.length) * 100}%` }} /></div>
      </div>
      <ul className="mt-3 divide-y divide-amber-100 rounded-xl bg-white">
        {todos.map((t) => (
          <li key={t.id}>
            <Link href={t.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.done ? "bg-teal-100 text-teal-700" : "border-2 border-amber-300 text-amber-600"}`}>{t.done ? "✓" : ""}</span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${t.done ? "text-gray-400 line-through" : "text-gray-900"}`}>{t.label}</span>
                {!t.done && <span className="block text-xs text-gray-500">{t.hint}</span>}
              </span>
              {!t.done && <span className="ml-auto text-gray-400">›</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
