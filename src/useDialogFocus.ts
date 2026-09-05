import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onCancel: () => void,
): void {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const earlierOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusInitial = window.requestAnimationFrame(() => {
      const target = initialFocusRef.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialogRef.current;
      target?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = earlierOverflow;
      opener?.focus();
    };
  }, [dialogRef, initialFocusRef, open]);
}
