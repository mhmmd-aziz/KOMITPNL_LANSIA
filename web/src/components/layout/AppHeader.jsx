import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Phone, RefreshCw } from "lucide-react";

function initials(name = "") {
  return (name || "AD").slice(0, 2).toUpperCase();
}

function UserDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-3 text-gray-700"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
          {initials(user?.nama)}
        </span>
        <span className="hidden text-sm font-medium sm:block">
          {user?.nama || "Admin"}
        </span>
        <ChevronDown
          className={`size-4 text-gray-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-3 w-[250px] rounded-2xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="px-1 pb-3">
            <span className="block text-sm font-semibold text-gray-800">
              {user?.nama || "Admin SIGAP"}
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {user?.email || "Pengelola Layanan"}
            </span>
          </div>
          <div className="border-t border-gray-200 pt-2.5">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="size-4 text-gray-500" aria-hidden="true" />
              Keluar Akun
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppHeader({
  toggleRef,
  drawerOpen,
  onOpenDrawer,
  title,
  subtitle,
  lastUpdated,
  emergencyWhatsapp,
  refreshing,
  onRefresh,
  user,
  onLogout,
}) {
  return (
    <header className="sticky top-0 z-30 flex w-full border-b border-gray-200 bg-white">
      <div className="flex grow items-center justify-between gap-3 px-4 py-3 xl:px-6 xl:py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            ref={toggleRef}
            type="button"
            onClick={onOpenDrawer}
            aria-label="Buka navigasi"
            aria-expanded={drawerOpen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 xl:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
              {title}
            </h2>
            {subtitle && (
              <p className="hidden truncate text-xs text-gray-500 sm:block">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {emergencyWhatsapp && (
            <span className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs font-semibold text-gray-800 lg:inline-flex">
              <Phone className="size-3.5 text-emerald-700" />
              WA Darurat: {emergencyWhatsapp}
            </span>
          )}

          {lastUpdated && (
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 md:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Sinkron {lastUpdated}
            </span>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Segarkan data"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Segarkan</span>
            </button>
          )}

          <UserDropdown user={user} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
