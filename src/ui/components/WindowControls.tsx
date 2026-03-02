import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faSquare, faXmark } from "@fortawesome/free-solid-svg-icons";

export function WindowControls() {
  const electron = window.electronAPI;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!electron) {
      return;
    }
    void electron.getWindowState().then((state) => {
      setIsMaximized(state.isMaximized);
    });
    return electron.onWindowStateChange((state) => {
      setIsMaximized(state.isMaximized);
    });
  }, [electron]);

  if (!electron) {
    return null;
  }

  return (
    <div className="window-controls" aria-label="Window controls">
      <button type="button" title="Minimize" onClick={() => void electron.windowMinimize()}>
        <FontAwesomeIcon icon={faMinus} />
      </button>
      <button
        type="button"
        title={isMaximized ? "Restore" : "Maximize"}
        onClick={() => void electron.windowToggleMaximize()}
      >
        <FontAwesomeIcon icon={faSquare} />
      </button>
      <button type="button" className="window-control-close" title="Close" onClick={() => void electron.windowClose()}>
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}
