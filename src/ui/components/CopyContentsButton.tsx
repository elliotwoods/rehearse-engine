import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

interface CopyContentsButtonProps {
  text: string;
  title: string;
  ariaLabel: string;
  className?: string;
  onCopySuccess?: () => void;
  onCopyError?: (message: string) => void;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-99999px";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }
}

export function CopyContentsButton(props: CopyContentsButtonProps) {
  const [showCopiedHint, setShowCopiedHint] = useState(false);
  const [hintPosition, setHintPosition] = useState<{ left: number; top: number } | null>(null);
  const dismissTimeoutRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!showCopiedHint) {
      setHintPosition(null);
      return;
    }

    const updateHintPosition = () => {
      const element = wrapRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      setHintPosition({
        left: rect.left + rect.width / 2,
        top: rect.top - 6
      });
    };

    updateHintPosition();
    window.addEventListener("scroll", updateHintPosition, true);
    window.addEventListener("resize", updateHintPosition);
    return () => {
      window.removeEventListener("scroll", updateHintPosition, true);
      window.removeEventListener("resize", updateHintPosition);
    };
  }, [showCopiedHint]);

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = (): void => {
    void copyToClipboard(props.text)
      .then(() => {
        if (dismissTimeoutRef.current !== null) {
          window.clearTimeout(dismissTimeoutRef.current);
        }
        setShowCopiedHint(true);
        dismissTimeoutRef.current = window.setTimeout(() => {
          setShowCopiedHint(false);
          dismissTimeoutRef.current = null;
        }, 1200);
        props.onCopySuccess?.();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Clipboard write failed";
        props.onCopyError?.(message);
      });
  };

  return (
    <span ref={wrapRef} className={`copy-contents-wrap ${props.className ?? ""}`.trim()}>
      {showCopiedHint && hintPosition
        ? createPortal(
            <span
              className="copy-contents-hint"
              style={{
                left: `${hintPosition.left}px`,
                top: `${hintPosition.top}px`
              }}
            >
              Copied
            </span>,
            document.body
          )
        : null}
      <button
        type="button"
        className="copy-contents-button"
        title={props.title}
        aria-label={props.ariaLabel}
        onClick={handleClick}
      >
        <FontAwesomeIcon icon={faCopy} />
      </button>
    </span>
  );
}
