import axios from "axios";

const defaultHost =
  typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";

export const BACKEND_URL = (
  import.meta.env.BACKEND_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  `http://${defaultHost}:8000`
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
    if (error.response?.status === 401 && !error.config?.signal?.aborted &&
        requestToken === `Bearer ${activeToken}`) {
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

export function getGroupWsUrl(groupId) {
  const token = localStorage.getItem("sigap_token") || "";
  const wsBase = BACKEND_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/groups/${groupId}?token=${encodeURIComponent(token)}`;
}

export default api;

