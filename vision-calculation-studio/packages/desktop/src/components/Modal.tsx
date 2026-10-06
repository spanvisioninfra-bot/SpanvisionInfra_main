import { useEffect, useRef, useCallback, useId, type ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  height?: number | string;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  width = 480,
  height,
  className,
  children,
  footer,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
    (focusable()[0] ?? dialog).focus();
    const trap = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== dialog || event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".modal-close-btn")) return;
    isDragging.current = true;
    const rect = dialogRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dialogRef.current || !overlayRef.current) return;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const dialogRect = dialogRef.current.getBoundingClientRect();
      let newX = e.clientX - overlayRect.left - dragOffset.current.x;
      let newY = e.clientY - overlayRect.top - dragOffset.current.y;
      newX = Math.max(0, Math.min(newX, overlayRect.width - dialogRect.width));
      newY = Math.max(0, Math.min(newY, overlayRect.height - dialogRect.height));
      dialogRef.current.style.left = newX + "px";
      dialogRef.current.style.top = newY + "px";
      dialogRef.current.style.transform = "none";
      dialogRef.current.style.position = "absolute";
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (e.key === "Escape" && dialogs[dialogs.length - 1] === dialogRef.current) onClose();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // Reset position when reopened
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.style.left = "50%";
      dialogRef.current.style.top = "50%";
      dialogRef.current.style.transform = "translate(-50%, -50%)";
      dialogRef.current.style.position = "absolute";
    }
  }, [open]);

  if (!open) return null;

  const style: React.CSSProperties = { width };
  if (height) style.height = height;

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div
        className={`modal-dialog${className ? ` ${className}` : ""}`}
        ref={dialogRef}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header" onMouseDown={handleHeaderMouseDown}>
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
