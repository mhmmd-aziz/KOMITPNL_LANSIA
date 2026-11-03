import { formatDate } from "../utils/format";
import { Skeleton } from "./Ui";

const ICON_TONE = {
  brand: "bg-gray-100 text-gray-900",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-gray-100 text-gray-800",
};

const PILL_TONE = {
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-gray-100 text-gray-700",
  dark: "bg-gray-900 text-white",
};

/** Label kecil berbentuk pil, seperti Badge di TailAdmin. */
export function Pill({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Kartu metrik gaya TailAdmin: ikon dalam kotak, label, angka besar, dan badge di kanan. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  badge,
  tone = "neutral",
  loading,
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${ICON_TONE[tone]}`}
      >
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <span className="text-sm text-gray-500">{label}</span>
          {loading ? (
            <Skeleton className="mt-2 h-9 w-16" />
          ) : (
            <h4 className="mt-2 text-3xl font-bold text-gray-800 tabular-nums">
              {value}
            </h4>
          )}
        </div>
        {!loading && badge}
      </div>
    </div>
  );
}

/** Setengah lingkaran progres dari SVG (grafik radial setengah lingkaran). */
export function HalfRing({ percent }) {
  const arc = "M 20 100 A 80 80 0 0 1 180 100";
  return (
    <svg
      viewBox="0 0 200 110"
      className="mx-auto w-full max-w-[340px]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ring-gradient" x1="0" x2="1">
          <stop offset="0%" stopColor="#a3a3a3" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
      </defs>
      <path
        d={arc}
        fill="none"
        stroke="#e4e7ec"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {percent > 0 && (
        <path
          d={arc}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
        />
      )}
    </svg>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-center text-xs text-gray-500 sm:text-sm">
        {label}
      </p>
      <p className="text-center text-base font-semibold text-gray-800 tabular-nums sm:text-lg">
        {value}
      </p>
    </div>
  );
}

/**
 * Kartu grafik radial setengah lingkaran untuk Performa Layanan Admin.
 * Menggabungkan grafik HalfRing dengan metrik agregat seluruh keluarga.
 */
export function SaasMonitoringCard({ kpis, loading }) {
  const percent = Math.min(100, Math.max(0, Math.round(kpis?.response_rate_pct ?? 100)));
  const unhandled = kpis?.unhandled_events ?? 0;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-gray-100">
      <div className="flex flex-1 flex-col rounded-2xl bg-white px-5 pt-5 pb-5 shadow-xs sm:px-6 sm:pt-6 sm:pb-8">
        <div>
          <h3 className="text-lg font-semibold tracking-normal text-gray-800">
            Grafik Penanganan &amp; Respons Keluarga
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Persentase kejadian jatuh yang telah ditindaklanjuti di aplikasi HP
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="relative">
            <HalfRing percent={loading ? 0 : percent} />
            <div className="absolute inset-x-0 bottom-3 text-center">
              <span className="block text-4xl font-semibold text-gray-800 tabular-nums">
                {loading ? "—" : `${percent}%`}
              </span>
              <span className="text-xs text-gray-500">
                kejadian selesai ditangani
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            {loading ? (
              <Pill>Memuat data…</Pill>
            ) : unhandled > 0 ? (
              <Pill tone="danger">{unhandled} menunggu respons keluarga</Pill>
            ) : (
              <Pill tone="success">Semua peringatan telah ditangani</Pill>
            )}
          </div>
          <p className="mx-auto mt-4 w-full max-w-[380px] text-center text-sm text-gray-500">
            {loading
              ? "Mengambil ringkasan performa layanan…"
              : `Dari ${kpis?.total_events ?? 0} total deteksi, ${
                  kpis?.handled_events ?? 0
                } kejadian telah direspons keluarga dengan akurasi AI ${
                  kpis?.ai_precision_pct ?? 100
                }%.`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-3.5 sm:gap-8 sm:py-5">
        <Stat label="Hari ini" value={loading ? "—" : kpis?.events_today ?? 0} />
        <div className="h-7 w-px bg-gray-200" />
        <Stat
          label="Ditangani"
          value={loading ? "—" : kpis?.handled_events ?? 0}
        />
        <div className="h-7 w-px bg-gray-200" />
        <Stat
          label="Alarm palsu"
          value={loading ? "—" : kpis?.false_alarm_events ?? 0}
        />
        <div className="h-7 w-px bg-gray-200" />
        <Stat
          label="Pesan suara"
          value={loading ? "—" : kpis?.total_voice_messages ?? 0}
        />
      </div>
    </div>
  );
}

export function MonitoringCard({
  group,
  events,
  todayCount,
  alertCount,
  loading,
  error,
}) {
  const total = events.length;
  const handled = events.filter((event) => event.status !== "baru").length;
  const falseAlarms = events.filter(
    (event) => event.status === "alarm_palsu"
  ).length;
  const percent = total ? Math.round((handled / total) * 100) : 0;
  const unknown = loading || error;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-gray-100">
      <div className="flex flex-1 flex-col rounded-2xl bg-white px-5 pt-5 pb-5 shadow-xs sm:px-6 sm:pt-6 sm:pb-8">
        <div>
          <h3 className="text-lg font-semibold tracking-normal text-gray-800">
            Status pemantauan
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {group.nama_lansia} · {group.nama_grup}
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="relative">
            <HalfRing percent={unknown ? 0 : percent} />
            <div className="absolute inset-x-0 bottom-3 text-center">
              <span className="block text-4xl font-semibold text-gray-800 tabular-nums">
                {unknown || !total ? "—" : `${percent}%`}
              </span>
              <span className="text-xs text-gray-500">
                kejadian ditindaklanjuti
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            {unknown ? (
              <Pill>Memuat data…</Pill>
            ) : alertCount > 0 ? (
              <Pill tone="danger">{alertCount} belum ditangani</Pill>
            ) : (
              <Pill tone="success">Tidak ada peringatan baru</Pill>
            )}
          </div>
          <p className="mx-auto mt-4 w-full max-w-[380px] text-center text-sm text-gray-500">
            {unknown
              ? "Mengambil kejadian terbaru grup ini."
              : total
              ? `Dari ${total} kejadian terbaru, ${handled} sudah ditindaklanjuti keluarga.`
              : "Belum ada kejadian tercatat untuk grup ini."}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-3.5 sm:gap-8 sm:py-5">
        <Stat label="Hari ini" value={unknown ? "—" : todayCount} />
        <div className="h-7 w-px bg-gray-200" />
        <Stat label="Ditangani" value={unknown ? "—" : handled - falseAlarms} />
        <div className="h-7 w-px bg-gray-200" />
        <Stat label="Alarm palsu" value={unknown ? "—" : falseAlarms} />
      </div>
    </div>
  );
}

export function MembersCard({ group }) {
  const members = group.members || [];
  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-normal text-gray-800">
            Anggota keluarga
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {members.length} anggota menerima peringatan
          </p>
        </div>
      </div>
      <ul className="mt-6 space-y-5">
        {members.slice(0, 5).map((member) => {
          const admin = Number(member.user_id) === Number(group.admin_id);
          return (
            <li
              key={member.user_id}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                  {member.nama?.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {member.nama}
                  </p>
                  <span className="block text-xs text-gray-500">
                    Bergabung {formatDate(member.joined_at)}
                  </span>
                </div>
              </div>
              <Pill tone={admin ? "dark" : "neutral"}>
                {admin ? "Admin" : "Keluarga"}
              </Pill>
            </li>
          );
        })}
      </ul>
      {!members.length && (
        <p className="mt-6 text-sm text-gray-500">
          Belum ada anggota terdaftar.
        </p>
      )}
    </div>
  );
}
