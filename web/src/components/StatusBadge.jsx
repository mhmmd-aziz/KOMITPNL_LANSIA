import { AlertTriangle, CheckCircle2, CircleHelp, CircleMinus, Wifi, WifiOff } from "lucide-react";

const statuses = {
  baru: { label: "Belum ditangani", variant: "danger", icon: AlertTriangle },
  ditangani: { label: "Sudah ditangani", variant: "success", icon: CheckCircle2 },
  alarm_palsu: { label: "Alarm palsu", variant: "neutral", icon: CircleMinus },
  online: { label: "Kamera online", variant: "success", icon: Wifi },
  offline: { label: "Kamera offline", variant: "neutral", icon: WifiOff },
};

export default function StatusBadge({ status }) {
  const { label, variant, icon: Icon } = statuses[status] || { label: "Status belum tersedia", variant: "neutral", icon: CircleHelp };
  return <span className={`badge badge-${variant}`}><Icon size={14} aria-hidden="true" />{label}</span>;
}

