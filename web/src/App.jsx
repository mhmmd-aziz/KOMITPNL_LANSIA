import { useEffect, useRef, useState } from "react";
import { SigapLoader } from "./components/Ui";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import LandingPage from "./pages/LandingPage";

const ADMIN_ROUTE = /^#\/(admin|login|dashboard|groups|group|cameras|events|members)(?:\/|$)/;
const PATH_ADMIN_ROUTE = /^\/(admin|login|dashboard|groups|group|cameras|events|members)(?:\/.*)?$/;

function readInitialHash() {
  if (window.location.hash) return window.location.hash;
  if (PATH_ADMIN_ROUTE.test(window.location.pathname)) {
    const targetHash = `#${window.location.pathname}`;
    window.history.replaceState(null, "", `/${targetHash}`);
    return targetHash;
  }
  return "";
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

export default function App() {
  const [hash, setHash] = useState(readInitialHash);
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

  const isAdminRoute = ADMIN_ROUTE.test(hash);
  const prevAdminRoute = useRef(isAdminRoute);

  useEffect(() => {
    if (!bootLoading) return undefined;
    const timer = setTimeout(() => setBootLoading(false), 550);
    return () => clearTimeout(timer);
  }, [bootLoading]);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (prevAdminRoute.current !== isAdminRoute) {
      prevAdminRoute.current = isAdminRoute;
      if (!prefersReducedMotion()) {
        setBootLoading(true);
      }
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (!isAdminRoute) {
      document.title = "SIGAP — Lebih cepat tahu, lebih sigap membantu";
    } else if (!user) {
      document.title = "Masuk · SIGAP Admin";
    }
  }, [isAdminRoute, user]);

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
    window.location.hash = "/admin";
  }

  function handleLogin(loggedInUser) {
    setSessionExpired(false);
    setUser(loggedInUser);
    if (/^#\/(admin|login)\/?$/.test(window.location.hash)) {
      window.location.hash = "/dashboard";
    }
  }

  return (
    <>
      {bootLoading && (
        <SigapLoader
          fullScreen
          label="Memuat SIGAP…"
          sublabel={isAdminRoute ? "Menyiapkan ruang pemantauan admin" : "Lebih cepat tahu, lebih sigap membantu"}
        />
      )}
      {!isAdminRoute ? (
        <LandingPage />
      ) : !user ? (
        <AuthPage sessionExpired={sessionExpired} onSuccess={handleLogin} />
      ) : (
        <DashboardPage user={user} onLogout={handleLogout} />
      )}
    </>
  );
}
