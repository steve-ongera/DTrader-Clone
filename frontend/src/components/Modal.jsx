import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({ title, onClose, children, size = "" }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal d-block" tabIndex={-1} onClick={onClose}>
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header py-2">
              <h6 className="modal-title">{title}</h6>
              <button className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
