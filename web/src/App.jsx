import { useEffect, useState } from "react";
import { SigapLoader } from "./components/Ui";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import LandingPage from "./pages/LandingPage";

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash || "");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [bootLoading, setBootLoading] = useState(() => !prefersReducedMotion());
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("sigap_user");
      const token = localStorage.getItem("sigap_token");
      const current = saved && token ? JSON.parse(saved) : null;
      return current?.role === "admin" ? current : null;
    } catch {
      return null;
    }
  });

  const isLandingRoute = /^#\/(beranda|landing)(?:\/|$)/.test(hash);

  useEffect(() => {
    if (!bootLoading) return undefined;
    const timer = setTimeout(() => setBootLoading(false), 450);
    return () => clearTimeout(timer);
  }, [bootLoading]);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (isLandingRoute) {
      document.title = "SIGAP — Lebih cepat tahu, lebih sigap membantu";
    } else if (!user) {
      document.title = "Masuk Admin · SIGAP";
    } else {
      document.title = "Dashboard Admin · SIGAP";
    }
  }, [isLandingRoute, user]);

  useEffect(() => {
    function handleUnauthorized() {
      setSessionExpired(true);
      setUser(null);
    }
    window.addEventListener("sigap:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("sigap:unauthorized", handleUnauthorized);
  }, []);

  function handleLogout() {
    localStorage.removeItem("sigap_token");
    localStorage.removeItem("sigap_user");
    setUser(null);
    setSessionExpired(false);
    window.location.hash = "/login";
  }

  function handleLogin(loggedInUser) {
    setSessionExpired(false);
    setUser(loggedInUser);
    window.location.hash = "/performa";
  }

  return (
    <>
      {bootLoading && (
        <SigapLoader
          fullScreen
          label="Memuat SIGAP…"
          sublabel={!user ? "Menyiapkan halaman masuk admin" : "Menyiapkan ruang pemantauan performa layanan"}
        />
      )}
      {isLandingRoute ? (
        <LandingPage />
      ) : !user ? (
        <AuthPage sessionExpired={sessionExpired} onSuccess={handleLogin} />
      ) : (
        <DashboardPage user={user} onLogout={handleLogout} />
      )}
    </>
  );
}
