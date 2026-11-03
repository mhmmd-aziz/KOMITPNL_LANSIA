import { KeyRound, X } from "lucide-react";

// Layout sidebar diadaptasi dari TailAdmin React (MIT): sidebar putih, menu rounded, widget di bawah.
// collapsed hanya berlaku di desktop (xl). Di HP sidebar selalu tampil penuh sebagai drawer.
export default function AppSidebar({ nav, activePage, open, onClose, collapsed = false, panelRef, alertCount, alertLimit, group }) {
  const hideWhenCollapsed = collapsed ? "xl:hidden" : "";

  return (
    <aside
      ref={panelRef}
      className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-gray-200 bg-white px-4 transition-all duration-300 ease-linear xl:translate-x-0 ${collapsed ? "xl:w-[80px]" : ""} ${open ? "translate-x-0" : "-translate-x-full"}`}
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label="Navigasi utama"
    >
      <div className={`flex items-center justify-between py-7 ${collapsed ? "xl:justify-center" : ""}`}>
        <a href="#/dashboard" className="flex items-center gap-2.5" aria-label="SIGAP, ke dashboard">
          <img src="/assets/symbol.svg" alt="" className="h-8 w-auto" />
          <img src="/assets/wordmark.svg" alt="" className={`h-5 w-auto ${hideWhenCollapsed}`} />
        </a>
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 xl:hidden" aria-label="Tutup navigasi" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>

      <nav className="mb-6 overflow-y-auto">
        <h2 className={`mb-3 text-xs leading-5 font-normal tracking-normal text-gray-400 uppercase ${collapsed ? "xl:text-center" : ""}`}>Menu</h2>
        <ul className="flex flex-col gap-1">
          {nav.map(({ id, label, icon: Icon }) => {
            const active = activePage === id || (id === "groups" && activePage === "group");
            const showAlert = id === "events" && alertCount > 0;
            return (
              <li key={id}>
                <a
                  href={`#/${id}`}
                  onClick={onClose}
                  title={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${collapsed ? "xl:justify-center" : ""} ${active ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  <Icon aria-hidden="true" className={`size-6 shrink-0 ${active ? "text-gray-900" : "text-gray-500 group-hover:text-gray-700"}`} strokeWidth={1.75} />
                  <span className={hideWhenCollapsed}>{label}</span>
                  {showAlert && (
                    <span className={`ml-auto rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ${hideWhenCollapsed}`} aria-label={`${alertCount} kejadian belum ditangani`}>
                      {alertCount === alertLimit ? `${alertLimit}+` : alertCount}
                    </span>
                  )}
                  {/* Saat diciutkan, jumlah peringatan diganti titik merah di pojok ikon */}
                  {showAlert && collapsed && <span className="absolute top-1.5 right-3 hidden h-2.5 w-2.5 rounded-full bg-red-600 xl:block" aria-hidden="true" />}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto mb-4 space-y-3">
        {/* Widget kode undangan, menggantikan widget promosi TailAdmin */}
        {group && (
          <div className={`rounded-2xl bg-gray-50 px-3 py-4 text-center ${hideWhenCollapsed}`}>
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-xs">
              <KeyRound className="size-4" aria-hidden="true" />
            </div>
            <h3 className="mb-1 text-sm font-semibold tracking-normal text-gray-900">Kode undangan</h3>
            <p className="mb-3 text-xs leading-5 text-gray-500">Bagikan agar keluarga bisa bergabung.</p>
            <p className="mb-3 rounded-lg border border-dashed border-gray-300 bg-white py-1.5 font-mono text-base font-semibold tracking-[0.2em] text-gray-800">{group.kode_undangan || "—"}</p>
            <a href="#/group" onClick={onClose} className="flex items-center justify-center rounded-full bg-gray-900 p-2.5 text-sm font-medium text-white hover:bg-gray-700">
              Lihat grup
            </a>
          </div>
        )}      </div>
    </aside>
  );
}
