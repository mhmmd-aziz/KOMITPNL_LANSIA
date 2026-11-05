import axios from "axios";

const defaultHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

// Gunakan hostname aktif browser (localhost atau IP LAN saat ini) agar tidak pernah nyangkut di IP Wi-Fi kemarin saat pindah tempat presentasi
export const BACKEND_URL = (
  import.meta.env.VITE_FORCE_BACKEND_URL || `http://${defaultHost}:8000`
).replace(/\/$/, "");

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 12000,
});

// Interceptor: sisipkan JWT Bearer token di setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sigap_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor: arahkan keluar jika sesi kedaluwarsa
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestToken = error.config?.headers?.Authorization;
    const activeToken = localStorage.getItem("sigap_token");
    if (
      error.response?.status === 401 &&
      !error.config?.signal?.aborted &&
      requestToken === `Bearer ${activeToken}`
    ) {
      const path = error.config?.url || "";
      if (!path.includes("/auth/login") && !path.includes("/auth/register")) {
        localStorage.removeItem("sigap_token");
        localStorage.removeItem("sigap_user");
        window.dispatchEvent(new Event("sigap:unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

export function getCameraStreamUrl(cameraId) {
  const token = localStorage.getItem("sigap_token") || "";
  return `${BACKEND_URL}/cameras/${cameraId}/stream?token=${encodeURIComponent(token)}`;
}

export function getSimulationStreamUrl(cameraId = 1, nonce = "") {
  const token = localStorage.getItem("sigap_token") || "";
  const bust = nonce ? `&_t=${encodeURIComponent(nonce)}` : "";
  return `${BACKEND_URL}/simulations/stream?camera_id=${cameraId}&token=${encodeURIComponent(token)}${bust}`;
}

export function getSimulationVideoFileUrl(videoName, cameraId = 1, rev = "") {
  const token = localStorage.getItem("sigap_token") || "";
  const bust = rev ? `&_v=${encodeURIComponent(rev)}` : "";
  return `${BACKEND_URL}/simulations/video-file?video_name=${encodeURIComponent(videoName)}&camera_id=${cameraId}&token=${encodeURIComponent(token)}${bust}`;
}

export function getGroupWsUrl(groupId) {
  const token = localStorage.getItem("sigap_token") || "";
  const wsBase = BACKEND_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/groups/${groupId}?token=${encodeURIComponent(token)}`;
}

export default api;

