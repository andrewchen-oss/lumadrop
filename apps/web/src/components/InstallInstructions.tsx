import { MoreVertical, PlusSquare, Share, X } from "lucide-react";
import { useEffect } from "react";

type InstallInstructionsProps = {
  isIos: boolean;
  onClose: () => void;
  open: boolean;
};

export function InstallInstructions({ isIos, onClose, open }: InstallInstructionsProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="install-modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="install-title"
        aria-modal="true"
        className="install-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button autoFocus className="install-modal-close" onClick={onClose} type="button" aria-label="Close install instructions">
          <X size={18} />
        </button>
        <span className="install-modal-kicker">Add to your phone</span>
        <h2 id="install-title">Keep LumaDrop one tap away.</h2>
        <p>Install it from your browser once, then open it from your home screen—even when there is no internet.</p>

        {isIos ? (
          <ol className="install-steps">
            <li><span><strong>1</strong><Share size={19} /></span><div>Open this page in <b>Safari</b>, then tap the Share button.</div></li>
            <li><span><strong>2</strong><PlusSquare size={19} /></span><div>Choose <b>Add to Home Screen</b>.</div></li>
            <li><span><strong>3</strong></span><div>Tap <b>Add</b>. LumaDrop will appear with your other apps.</div></li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li><span><strong>1</strong><MoreVertical size={19} /></span><div>Open your browser menu.</div></li>
            <li><span><strong>2</strong><PlusSquare size={19} /></span><div>Choose <b>Install app</b> or <b>Add to Home screen</b>.</div></li>
            <li><span><strong>3</strong></span><div>Confirm the install, then launch LumaDrop from its new icon.</div></li>
          </ol>
        )}

        <button className="primary-button install-modal-done" onClick={onClose} type="button">Got it</button>
      </section>
    </div>
  );
}
