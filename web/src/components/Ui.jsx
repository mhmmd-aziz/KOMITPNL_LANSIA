import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";

const openDialogs = [];
let previousBodyOverflow = "";

export function Button({ variant = "primary", icon: Icon, children, loading = false, className = "", disabled, type = "button", ...props }) {
  return <button type={type} className={`btn btn-${variant} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <Loader2 size={18} className="spin" aria-hidden="true" /> : Icon ? <Icon size={18} aria-hidden="true" /> : null}
    {children}
  </button>;
}

export function EmptyState({ image, title, description, action }) {
  return <div className="empty-state">
    {image && <img src={image} alt="" className="empty-state-image" />}
    <h3>{title}</h3>
    {description && <p className="muted">{description}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>;
}

export function InlineError({ message, onRetry }) {
  if (!message) return null;
  return <div className="alert alert-warning" role="alert">
    <AlertCircle size={20} aria-hidden="true" />
    <span>{message}</span>
    {onRetry && <Button variant="ghost" icon={RefreshCw} onClick={onRetry}>Coba lagi</Button>}
  </div>;
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SigapLoader({
  label = "Memuat SIGAP…",
  sublabel = "",
  fullScreen = false,
  overlay = false,
  size = "md",
  light = false,
}) {
  const classes = [
    "sigap-loader",
    `sigap-loader-${size}`,
    fullScreen ? "sigap-loader-fullscreen" : "",
    overlay ? "sigap-loader-overlay" : "",
    light ? "sigap-loader-light" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {/* Fullscreen: logo + garis tipis bergerak. Lainnya: spinner tipis + teks */}
      {fullScreen ? (
        <>
          <img src="/assets/wordmark.svg" alt="" className="sigap-loader-wordmark" aria-hidden="true" />
          <span className="sigap-loader-bar" aria-hidden="true"><span className="sigap-loader-bar-fill" /></span>
        </>
      ) : (
        <>
          <span className="sigap-loader-spinner" aria-hidden="true" />
          {label && <strong className="sigap-loader-label">{label}</strong>}
          {sublabel && <p className="sigap-loader-sublabel">{sublabel}</p>}
        </>
      )}
    </div>
  );
}

export function Modal({ title, description, children, onClose, footer, wide = false }) {
  const id = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    if (openDialogs.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(id);
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
    const frame = requestAnimationFrame(() => {
      if (openDialogs.at(-1) === id) (dialog.querySelector("[autofocus]") || focusable()[0] || dialog).focus();
    });
    function onKeyDown(event) {
      if (openDialogs.at(-1) !== id) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); closeRef.current?.();
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [id]);

  return createPortal(<div className="dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && openDialogs.at(-1) === id) closeRef.current?.();
  }}>
    <section ref={dialogRef} className={`dialog ${wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1}>
      <div className="dialog-header">
        <div><h2 id={`${id}-title`}>{title}</h2>{description && <p className="muted" id={`${id}-description`}>{description}</p>}</div>
        <button type="button" className="icon-button" aria-label="Tutup dialog" onClick={() => closeRef.current?.()}><X size={22} aria-hidden="true" /></button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </section>
  </div>, document.body);
}
