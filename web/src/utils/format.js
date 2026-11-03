const WIB = "Asia/Jakarta";

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, options = {}) {
  const date = validDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("id-ID", {
    timeZone: WIB,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
}

export function formatTime(value, options = {}) {
  const date = validDate(value);
  if (!date) return "—";
  return `${date.toLocaleTimeString("id-ID", {
    timeZone: WIB,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  })} WIB`;
}

export function formatDateTime(value) {
  return validDate(value) ? `${formatDate(value)}, ${formatTime(value)}` : "—";
}

export function dateKeyWib(value = new Date()) {
  const date = validDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function errorMessage(error, fallback = "Terjadi kendala. Silakan coba lagi.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return "Periksa kembali data yang diisi. Ada isian yang belum sesuai.";
  }
  if (error?.code === "ECONNABORTED") return "Server belum merespons. Silakan coba lagi.";
  if (error?.message && !error?.isAxiosError) return error.message;
  return fallback;
}

export function isOwner(user, group) {
  return Boolean(user && group && Number(group.admin_id) === Number(user.id));
}
