interface KeyboardMapModalProps {
  open: boolean;
  onClose(): void;
}

const SHORTCUTS = [
  { key: "Space", action: "Play / Pause simulation" },
  { key: "Tab", action: "Next camera (1s tween)" },
  { key: "Shift + Tab", action: "Previous camera (1s tween)" },
  { key: "Delete", action: "Delete current selection" },
  { key: "Ctrl/Cmd + S", action: "Save session" },
  { key: "Ctrl/Cmd + Shift + S", action: "Save session as..." },
  { key: "Ctrl/Cmd + Z", action: "Undo" },
  { key: "Ctrl/Cmd + Shift + Z", action: "Redo" },
  { key: "F", action: "Frame selected object (planned)" },
  { key: "?", action: "Toggle keyboard map" }
];

export function KeyboardMapModal(props: KeyboardMapModalProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="keyboard-map-backdrop" onClick={props.onClose}>
      <div className="keyboard-map" onClick={(event) => event.stopPropagation()}>
        <h3>Keyboard Map</h3>
        <ul>
          {SHORTCUTS.map((entry) => (
            <li key={entry.key}>
              <kbd>{entry.key}</kbd>
              <span>{entry.action}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

