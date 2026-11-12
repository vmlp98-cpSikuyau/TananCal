import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}

/** Accessible modal: focus moves in, Tab is trapped, Esc closes, focus returns to the opener. */
export function Modal({ title, onClose, children, wide, footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current!;
    const first = root.querySelector<HTMLElement>('.modal-body input, .modal-body select, .modal-body textarea');
    (first ?? root.querySelector<HTMLElement>(FOCUSABLE) ?? root).focus();
    document.body.classList.add('modal-open');

    function onKey(e: KeyboardEvent) {
      // Only the top-most modal reacts.
      const all = document.querySelectorAll('.modal-overlay');
      if (all[all.length - 1] !== root.parentElement) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (document.querySelectorAll('.modal-overlay').length <= 1) document.body.classList.remove('modal-open');
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Require typing this text before confirming (used for deleting groups). */
  requireText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, requireText, onConfirm, onClose }: ConfirmProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !requireText || typed.trim() === requireText;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={!ok || busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
      {requireText && (
        <label className="field">
          <span>Type <strong>{requireText}</strong> to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      )}
    </Modal>
  );
}
