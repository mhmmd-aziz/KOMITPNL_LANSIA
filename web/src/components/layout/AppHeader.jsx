import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, House, LogOut, Menu } from "lucide-react";

function initials(name = "") {
  return name.slice(0, 2).toUpperCase();
}

// Menu profil seperti user dropdown TailAdmin: tutup saat klik di luar atau tekan Escape.
function UserDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-3 text-gray-700">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-800">{initials(user.nama)}</span>
        <span className="hidden text-sm font-medium sm:block">{user.nama}</span>
        <ChevronDown className={`size-5 text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-4 w-[260px] rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
          <div className="px-1 pb-3">
            <span className="block text-sm font-medium text-gray-700">{user.nama}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{user.email || "Administrator"}</span>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <button type="button" role="menuitem" onClick={onLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              <LogOut className="size-5 text-gray-500" aria-hidden="true" />
              Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Header diadaptasi dari TailAdmin React (MIT). Kotak pencarian diganti pemilih grup aktif.
export default function AppHeader({ toggleRef, drawerOpen, onOpenDrawer, groups, groupId, loading, onSelectGroup, connected, alertCount, onBellClick, user, onLogout }) {
  return (
    <header className="sticky top-0 z-30 flex w-full border-b border-gray-200 bg-white">
      <div className="flex grow items-center justify-between gap-3 px-4 py-3 xl:px-6 xl:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button ref={toggleRef} type="button" onClick={onOpenDrawer} aria-label="Buka navigasi" aria-expanded={drawerOpen} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 xl:hidden">
            <Menu className="size-5" />
          </button>

          <div className="relative w-full max-w-[430px]">
            <label htmlFor="active-group" className="sr-only">Grup aktif</label>
            <House className="pointer-events-none absolute top-1/2 left-3.5 size-5 sm:left-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <select
              id="active-group"
              disabled={!groups.length}
              value={groupId || ""}
              onChange={(event) => onSelectGroup(event.target.value)}
              className="h-11 w-full appearance-none rounded-full border border-gray-200 bg-transparent py-2.5 pr-4 pl-11 text-sm sm:pr-24 sm:pl-12 text-gray-800 shadow-xs focus:border-gray-400 focus:ring-3 focus:ring-gray-900/5 focus:outline-hidden"
            >
              <option value="" disabled>{loading ? "Memuat grup…" : "Belum ada grup"}</option>
              {groups.map((item) => <option key={item.id} value={item.id}>{item.nama_grup}</option>)}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-lg sm:inline border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">Grup aktif</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium md:inline-flex ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`} title={connected ? "Pembaruan grup aktif terhubung" : "Pembaruan belum terhubung"}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
            {connected ? "Pembaruan aktif" : "Belum terhubung"}
          </span>

          <button type="button" onClick={onBellClick} aria-label={alertCount ? `${alertCount} kejadian belum ditangani` : "Lihat kejadian"} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700">
            {alertCount > 0 && (
              <span className="absolute top-0.5 right-0 z-10 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
            )}
            <Bell className="size-5" aria-hidden="true" />
          </button>

          <UserDropdown user={user} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
