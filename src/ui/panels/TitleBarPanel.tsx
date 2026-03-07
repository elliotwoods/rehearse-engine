import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookmark, faCircleInfo, faFloppyDisk, faPenToSquare, faPlus, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { BUILD_INFO, formatBuildTimestamp } from "@/app/buildInfo";
import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";
import { AboutModal } from "@/ui/components/AboutModal";
import { WindowControls } from "@/ui/components/WindowControls";
import appIconUrl from "../../../icon.png";

const APP_NAME = "Simularca";

interface TitleBarPanelProps {
  requestTextInput(args: {
    title: string;
    label: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel?: string;
  }): Promise<string | null>;
}

function nextSessionName(existingNames: string[]): string {
  const set = new Set(existingNames);
  if (!set.has("untitled")) {
    return "untitled";
  }
  let index = 2;
  while (set.has(`untitled-${String(index)}`)) {
    index += 1;
  }
  return `untitled-${String(index)}`;
}

export function TitleBarPanel(props: TitleBarPanelProps) {
  const kernel = useKernel();
  const state = useAppStore((store) => store.state);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const [isSessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [isRenamingSession, setRenamingSession] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sessionRenameInputRef = useRef<HTMLInputElement | null>(null);
  const isReadOnly = state.mode === "web-ro";
  const buildMeta = `${BUILD_INFO.commitShortSha || "unknown"} | ${formatBuildTimestamp(BUILD_INFO.buildTimestampIso)}`;

  const sessionOptions = useMemo(() => {
    if (availableSessions.includes(state.activeSessionName)) {
      return availableSessions;
    }
    return [state.activeSessionName, ...availableSessions];
  }, [availableSessions, state.activeSessionName]);

  useEffect(() => {
    void kernel.sessionService.listSessions().then((sessions) => {
      setAvailableSessions(sessions);
    });
  }, [kernel, state.activeSessionName]);

  useEffect(() => {
    if (!isSessionMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setSessionMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isSessionMenuOpen]);

  useEffect(() => {
    if (isRenamingSession) {
      return;
    }
    setSessionNameDraft(state.activeSessionName);
  }, [isRenamingSession, state.activeSessionName]);

  useEffect(() => {
    if (!isRenamingSession) {
      return;
    }
    const input = sessionRenameInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.setSelectionRange(0, input.value.length);
  }, [isRenamingSession]);

  const startInlineRename = (): void => {
    if (isReadOnly) {
      return;
    }
    setSessionMenuOpen(false);
    setSessionNameDraft(state.activeSessionName);
    setRenamingSession(true);
  };

  const cancelInlineRename = (): void => {
    setSessionNameDraft(state.activeSessionName);
    setRenamingSession(false);
  };

  const commitInlineRename = (): void => {
    const nextName = sessionNameDraft.trim();
    const previousName = state.activeSessionName;
    if (!nextName || nextName === previousName) {
      cancelInlineRename();
      return;
    }
    setRenamingSession(false);
    void kernel.sessionService.renameSession(previousName, nextName).then(() => {
      setAvailableSessions((prev) =>
        prev
          .filter((entry) => entry !== previousName)
          .concat(nextName)
          .sort((a, b) => a.localeCompare(b))
      );
    });
  };

  return (
    <div className="titlebar">
      <div className="titlebar-left titlebar-interactive">
        <div className="titlebar-app-icon" aria-hidden="true">
          <img src={appIconUrl} alt="" />
        </div>
        <button
          type="button"
          className="titlebar-brand-button"
          title={BUILD_INFO.commitSubject}
          onClick={() => {
            setAboutOpen(true);
          }}
        >
          <div className="titlebar-brand">
            <strong>{APP_NAME}</strong>
            <span>v{BUILD_INFO.version}</span>
            <span>{buildMeta}</span>
          </div>
          <FontAwesomeIcon icon={faCircleInfo} />
        </button>
      </div>

      <div className="titlebar-center titlebar-interactive">
        <div className="titlebar-session" ref={menuRef}>
          <div className="titlebar-session-row">
            {isRenamingSession ? (
              <div className="titlebar-session-inline-rename">
                <span>Session:</span>
                <input
                  ref={sessionRenameInputRef}
                  className="titlebar-session-inline-input"
                  value={sessionNameDraft}
                  onChange={(event) => {
                    setSessionNameDraft(event.target.value);
                  }}
                  onBlur={() => {
                    commitInlineRename();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitInlineRename();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelInlineRename();
                    }
                  }}
                />
                {state.dirty ? <em>*</em> : null}
              </div>
            ) : (
              <button
                type="button"
                className="titlebar-session-trigger"
                title="Switch session"
                onClick={() => setSessionMenuOpen((value) => !value)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startInlineRename();
                }}
              >
                Session: <strong>{state.activeSessionName}</strong>
                {state.dirty ? <em>*</em> : null}
              </button>
            )}
            {state.dirty ? (
              <button
                type="button"
                className="titlebar-session-save-stale"
                disabled={isReadOnly}
                title="Save session"
                onClick={() => {
                  void kernel.sessionService.saveSession();
                }}
              >
                <FontAwesomeIcon icon={faFloppyDisk} />
              </button>
            ) : null}
          </div>
          {isSessionMenuOpen ? (
            <div className="titlebar-session-popover">
              <label>Active Session</label>
              <select
                value={state.activeSessionName}
                onChange={(event) => {
                  setSessionMenuOpen(false);
                  void kernel.sessionService.loadSession(event.target.value);
                }}
              >
                {sessionOptions.map((sessionName) => (
                  <option key={sessionName} value={sessionName}>
                    {sessionName}
                  </option>
                ))}
              </select>
              <div className="titlebar-session-actions">
                <button
                  type="button"
                  title="Reload from last save"
                  onClick={() => {
                    if (state.dirty) {
                      const confirmed = window.confirm("Discard unsaved changes and reload this session from disk?");
                      if (!confirmed) {
                        return;
                      }
                    }
                    setSessionMenuOpen(false);
                    void kernel.sessionService.loadSession(state.activeSessionName);
                  }}
                >
                  <FontAwesomeIcon icon={faRotateRight} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Rename session"
                  onClick={() => {
                    startInlineRename();
                  }}
                >
                  <FontAwesomeIcon icon={faPenToSquare} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="New session"
                  onClick={() => {
                    void props
                      .requestTextInput({
                        title: "Create New Session",
                        label: "Session name",
                        initialValue: nextSessionName(sessionOptions),
                        confirmLabel: "Create"
                      })
                      .then((nextName) => {
                        if (!nextName) {
                          return;
                        }
                        setSessionMenuOpen(false);
                        void kernel.sessionService.createNewSession(nextName).then(() => {
                          setAvailableSessions((prev) => (prev.includes(nextName) ? prev : [...prev, nextName]));
                        });
                      });
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Save"
                  onClick={() => {
                    void kernel.sessionService.saveSession();
                  }}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Save as..."
                  onClick={() => {
                    void props
                      .requestTextInput({
                        title: "Save Session As",
                        label: "Session name",
                        initialValue: state.activeSessionName,
                        confirmLabel: "Save"
                      })
                      .then((nextName) => {
                        if (!nextName) {
                          return;
                        }
                        setSessionMenuOpen(false);
                        void kernel.sessionService.saveAs(nextName).then(() => {
                          setAvailableSessions((prev) => (prev.includes(nextName) ? prev : [...prev, nextName]));
                        });
                      });
                  }}
                >
                  <FontAwesomeIcon icon={faBookmark} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="titlebar-right titlebar-interactive">
        <WindowControls />
      </div>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}


