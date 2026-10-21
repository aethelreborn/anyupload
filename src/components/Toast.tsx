"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckIcon, CloseIcon, SpinnerIcon } from "@/components/Icons";

export type ToastTone = "info" | "success" | "error";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before the toast disappears. `0` keeps it until dismissed. */
  duration?: number;
};

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
};

type ToastApi = {
  /** Shows a toast and returns its id. */
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID();
      const tone = input.tone ?? "info";
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        tone,
        duration: input.duration ?? (tone === "error" ? 8000 : 4000),
      };

      setToasts((current) => [...current.slice(-3), toast]);

      if (toast.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), toast.duration),
        );
      }

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="panel-raised animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3.5"
          >
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                toast.tone === "success"
                  ? "bg-success-soft text-success"
                  : toast.tone === "error"
                    ? "bg-danger-soft text-danger"
                    : "bg-accent-soft text-accent"
              }`}
            >
              {toast.tone === "success" ? (
                <CheckIcon className="size-3.5" />
              ) : toast.tone === "error" ? (
                <CloseIcon className="size-3.5" />
              ) : (
                <SpinnerIcon className="size-3.5" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {toast.description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
