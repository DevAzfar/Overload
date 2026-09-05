import { useId, useRef } from "react";
import { useDialogFocus } from "./useDialogFocus";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, dialogRef, cancelRef, onCancel);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Please confirm</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="confirm-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={destructive ? "confirm-action destructive" : "confirm-action"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
