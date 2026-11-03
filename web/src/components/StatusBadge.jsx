import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export default function StatusBadge({ status }) {
  if (status === "baru") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold tracking-wide text-red-800">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
        BELUM DITANGANI
      </span>
    );
  }

  if (status === "ditangani") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-wide text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
        SUDAH DITANGANI
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700">
      <XCircle className="h-3.5 w-3.5 text-slate-500" />
      ALARM PALSU
    </span>
  );
}

