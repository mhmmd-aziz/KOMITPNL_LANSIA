import { useEffect, useState } from "react";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("sigap_user");
      const token = localStorage.getItem("sigap_token");
      return saved && token ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
    }
    window.addEventListener("sigap:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("sigap:unauthorized", handleUnauthorized);
  }, []);

  function handleLogout() {
    localStorage.removeItem("sigap_token");
    localStorage.removeItem("sigap_user");
    setUser(null);
  }

  if (!user) {
    return <AuthPage onSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  return <DashboardPage user={user} onLogout={handleLogout} />;
}

