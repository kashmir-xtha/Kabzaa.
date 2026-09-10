import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "error" | "info" | "success";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[min(90vw,340px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`notch-sm px-4 py-3 text-sm font-medium shadow-lg border ${
              t.kind === "error"
                ? "bg-signal/15 border-signal text-parchment"
                : t.kind === "success"
                ? "bg-teal/15 border-teal text-parchment"
                : "bg-ink-raised-2 border-ink-border text-parchment"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside a ToastProvider");
  return ctx;
}
