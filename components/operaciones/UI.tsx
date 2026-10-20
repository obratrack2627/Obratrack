"use client";
import {
  useEffect,
  useId,
  useRef,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { formatCLP, formatThousands, parseThousands } from "@/lib/utils";

export function Campo({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="op-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
export function Monto({
  value,
  onChange,
  required = false,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      inputMode="numeric"
      required={required}
      value={value ? formatThousands(String(value)) : ""}
      placeholder="0"
      onChange={(e) => onChange(parseThousands(e.target.value))}
    />
  );
}
export function Indicador({
  label,
  value,
  money = false,
}: {
  label: string;
  value: number | string;
  money?: boolean;
}) {
  return (
    <div className="op-card">
      <p className="op-muted text-xs mb-2">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold tracking-tight break-words">
        {money ? formatCLP(Number(value)) : value}
      </p>
    </div>
  );
}
export function ErrorCarga({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div role="alert" className="op-card border-red-300">
      <p>{error}</p>
      <button className="op-secondary mt-3" onClick={retry}>
        Reintentar
      </button>
    </div>
  );
}
export function Vacio({ children }: { children: ReactNode }) {
  return <p className="op-muted py-8 text-center text-sm">{children}</p>;
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="op-dialog"
    >
      <div className="op-no-print flex justify-between items-center gap-4 mb-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Cerrar"
          className="op-icon"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
