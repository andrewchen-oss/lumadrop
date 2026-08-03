import { FileUp, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

type DropZoneProps = {
  disabled?: boolean;
  onFile: (file: File) => void;
};

export function DropZone({ disabled = false, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const chooseFile = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  return (
    <div
      className={`drop-zone${isDragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={chooseFile}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) {
          onFile(file);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          chooseFile();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.target.value = "";
        }}
      />
      <div className="drop-zone-icon" aria-hidden="true">
        <FileUp size={27} strokeWidth={1.7} />
      </div>
      <div>
        <strong>Drop a file into the light</strong>
        <p>or click to choose · up to 8 MB</p>
      </div>
      <span className="drop-zone-pill">
        <Sparkles size={13} /> No upload
      </span>
    </div>
  );
}
