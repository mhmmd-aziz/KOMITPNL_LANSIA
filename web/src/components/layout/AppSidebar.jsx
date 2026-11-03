import { Lock, Sparkles, X } from "lucide-react";

// Layout sidebar gaya TailAdmin (putih bersih, menu rounded, kartu privasi di bawah)
export default function AppSidebar({
  nav,
  activePage,
  open,
  onClose,
  onSelectPage,
  collapsed = false,
  panelRef,
}) {
  const hideWhenCollapsed = collapsed ? "xl:hidden" : "";

  return (
    <aside
      ref={panelRef}
      className={`fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col border-r border-gray-200 bg-white px-4 transition-all duration-300 ease-linear xl:translate-x-0 ${
        collapsed ? "xl:w-[80px]" : ""
      } ${open ? "translate-x-0" : "-translate-x-full"}`}
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label="Navigasi utama admin"
    >
      <div
        className={`flex items-center justify-between py-7 ${
          collapsed ? "xl:justify-center" : ""
        }`}
      >
        <a
          href="#/performa"
          onClick={(e) => {
            e.preventDefault();
            onSelectPage?.("performa");
            onClose?.();
          }}
          className="flex items-center gap-2.5"
          aria-label="SIGAP Admin"
        >
          <img src="/assets/symbol.svg" alt="" className="h-8 w-auto" />
          <div className={hideWhenCollapsed}>
            <img src="/assets/wordmark.svg" alt="SIGAP" className="h-5 w-auto" />
            <span className="mt-0.5 block text-[11px] font-medium text-gray-500">
              Pusat Kendali Layanan
            </span>
          </div>
        </a>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 xl:hidden"
          aria-label="Tutup navigasi"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="mb-6 overflow-y-auto">
        <h2
          className={`mb-3 px-2 text-xs leading-5 font-medium tracking-wider text-gray-400 uppercase ${
            collapsed ? "xl:text-center" : ""
          }`}
        >
          Menu Utama
        </h2>
        <ul className="flex flex-col gap-1.5">
          {nav.map(({ id, label, subtitle, icon: Icon }) => {
            const active = activePage === id;
            return (
              <li key={id}>
                <a
                  href={`#/${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectPage?.(id);
                    onClose?.();
                  }}
                  title={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    collapsed ? "xl:justify-center" : ""
                  } ${
                    active
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-5 shrink-0 ${
                      active
                        ? "text-white"
                        : "text-gray-500 group-hover:text-gray-800"
                    }`}
                    strokeWidth={1.85}
                  />
                  <div className={`min-w-0 ${hideWhenCollapsed}`}>
                    <span className="block truncate font-semibold">{label}</span>
                    {subtitle && (
                      <span
                        className={`block truncate text-xs ${
                          active ? "text-gray-300" : "text-gray-400"
                        }`}
                      >
                        {subtitle}
                      </span>
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto mb-5 space-y-3">
        <div
          className={`rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-4 text-center ${hideWhenCollapsed}`}
        >
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-xs">
            <Lock className="size-4" aria-hidden="true" />
          </div>
          <h3 className="mb-1 text-sm font-semibold tracking-normal text-gray-900">
            Privasi Keluarga Terkunci
          </h3>
          <p className="mb-3 text-xs leading-5 text-gray-500">
            Kamera rumah dan riwayat lansia dikunci dengan{" "}
            <strong className="text-gray-800">Kode Keluarga</strong> di aplikasi HP.
            Admin hanya memantau performa layanan.
          </p>
          <button
            type="button"
            onClick={() => {
              onSelectPage?.("simulasi");
              onClose?.();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700"
          >
            <Sparkles className="size-3.5" />
            Buka Lab Simulasi AI
          </button>
        </div>
      </div>
    </aside>
  );
}
