import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: Kind; text: string }
interface ToastApi { push: (text: string, kind?: Kind) => void }

const Ctx = createContext<ToastApi>({ push: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
