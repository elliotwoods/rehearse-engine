import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookmark,
  faCircleInfo,
  faFloppyDisk,
  faPenToSquare,
  faPlus,
  faRotateRight,
  faStar,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { BUILD_INFO, formatBuildTimestamp } from "@/app/buildInfo";
import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";
import { AboutModal } from "@/ui/components/AboutModal";
import { WindowControls } from "@/ui/components/WindowControls";
import type { ProjectSnapshotListEntry } from "@/types/ipc";
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

function nextUntitledName(existingNames: string[], baseName: string): string {
  const used = new Set(existingNames);
  if (!used.has(baseName)) {
    return baseName;
  }
  let index = 2;
  while (used.has(`${baseName}-${String(index)}`)) {
    index += 1;
  }
  return `${baseName}-${String(index)}`;
}

export function TitleBarPanel(props: TitleBarPanelProps) {
  const kernel = useKernel();
  const state = useAppStore((store) => store.state);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [availableSnapshots, setAvailableSnapshots] = useState<ProjectSnapshotListEntry[]>([]);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isReadOnly = state.mode === "web-ro";
  const buildMeta = `${BUILD_INFO.commitShortSha || "unknown"} | ${formatBuildTimestamp(BUILD_INFO.buildTimestampIso)}`;

  const projectOptions = useMemo(() => {
    if (availableProjects.includes(state.activeProjectName)) {
      return availableProjects;
    }
    return [state.activeProjectName, ...availableProjects];
  }, [availableProjects, state.activeProjectName]);

  const snapshotOptions = useMemo(() => {
    if (availableSnapshots.some((entry) => entry.name === state.activeSnapshotName)) {
      return availableSnapshots;
    }
    return [{ name: state.activeSnapshotName, updatedAtIso: null }, ...availableSnapshots];
  }, [availableSnapshots, state.activeSnapshotName]);

  const formatSnapshotDate = (updatedAtIso: string | null): string => {
    if (!updatedAtIso) {
      return "No saved date";
    }
    const date = new Date(updatedAtIso);
    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  };

  useEffect(() => {
    void kernel.projectService.listProjects().then(setAvailableProjects);
  }, [kernel, state.activeProjectName]);

  useEffect(() => {
    void kernel.projectService.listSnapshots(state.activeProjectName).then(setAvailableSnapshots);
  }, [kernel, state.activeProjectName, state.activeSnapshotName]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isMenuOpen]);

  const refreshProjects = (): void => {
    void kernel.projectService.listProjects().then(setAvailableProjects);
  };

  const refreshSnapshots = (): void => {
    void kernel.projectService.listSnapshots(state.activeProjectName).then(setAvailableSnapshots);
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
        <div className="titlebar-project" ref={menuRef}>
          <div className="titlebar-project-row">
            <button
              type="button"
              className="titlebar-project-trigger"
              title="Switch project or snapshot"
              onClick={() => setMenuOpen((value) => !value)}
            >
              Project: <strong>{state.activeProjectName}</strong> / Snapshot: <strong>{state.activeSnapshotName}</strong>
              {state.dirty ? <em>*</em> : null}
            </button>
            {state.dirty ? (
              <button
                type="button"
                className="titlebar-project-save-stale"
                disabled={isReadOnly}
                title="Save project"
                onClick={() => {
                  void kernel.projectService.saveProject();
                }}
              >
                <FontAwesomeIcon icon={faFloppyDisk} />
              </button>
            ) : null}
          </div>
          {isMenuOpen ? (
            <div className="titlebar-project-popover">
              <div className="titlebar-project-section">
                <label>Active Project</label>
                <select
                  value={state.activeProjectName}
                  onChange={(event) => {
                    setMenuOpen(false);
                    void kernel.projectService.loadProject(event.target.value, "main");
                  }}
                >
                  {projectOptions.map((projectName) => (
                    <option key={projectName} value={projectName}>
                      {projectName}
                    </option>
                  ))}
                </select>

                <div className="titlebar-project-actions">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    title="New project"
                    onClick={() => {
                      void props
                        .requestTextInput({
                          title: "Create New Project",
                          label: "Project name",
                          initialValue: nextUntitledName(projectOptions, "untitled"),
                          confirmLabel: "Create"
                        })
                        .then((nextName) => {
                          if (!nextName) {
                            return;
                          }
                          setMenuOpen(false);
                          void kernel.projectService.createNewProject(nextName).then(refreshProjects);
                        });
                    }}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    title="Rename project"
                    onClick={() => {
                      void props
                        .requestTextInput({
                          title: "Rename Project",
                          label: "Project name",
                          initialValue: state.activeProjectName,
                          confirmLabel: "Rename"
                        })
                        .then((nextName) => {
                          if (!nextName) {
                            return;
                          }
                          setMenuOpen(false);
                          void kernel.projectService.renameProject(state.activeProjectName, nextName).then(refreshProjects);
                        });
                    }}
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    title="Save project"
                    onClick={() => {
                      setMenuOpen(false);
                      void kernel.projectService.saveProject();
                    }}
                  >
                    <FontAwesomeIcon icon={faFloppyDisk} />
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    title="Set as default project"
                    onClick={() => {
                      setMenuOpen(false);
                      void kernel.projectService.setDefaultProject();
                    }}
                  >
                    <FontAwesomeIcon icon={faStar} />
                  </button>
                </div>
              </div>

              <div className="titlebar-project-divider" />

              <div className="titlebar-project-section">
                <label>Active Snapshot</label>
                <div className="titlebar-project-snapshot-list" role="listbox" aria-label="Project snapshots">
                  {snapshotOptions.map((snapshot) => {
                    const isActive = snapshot.name === state.activeSnapshotName;
                    return (
                      <button
                        key={snapshot.name}
                        type="button"
                        className={`titlebar-project-snapshot-item${isActive ? " is-active" : ""}`}
                        aria-selected={isActive}
                        onClick={() => {
                          setMenuOpen(false);
                          void kernel.projectService.loadProject(state.activeProjectName, snapshot.name);
                        }}
                      >
                        <span className="titlebar-project-snapshot-name">{snapshot.name}</span>
                        <span className="titlebar-project-snapshot-date">{formatSnapshotDate(snapshot.updatedAtIso)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="titlebar-project-actions">
                <button
                  type="button"
                  title="Reload current snapshot"
                  onClick={() => {
                    if (state.dirty) {
                      const confirmed = window.confirm("Discard unsaved changes and reload this snapshot from disk?");
                      if (!confirmed) {
                        return;
                      }
                    }
                    setMenuOpen(false);
                    void kernel.projectService.loadProject(state.activeProjectName, state.activeSnapshotName);
                  }}
                >
                  <FontAwesomeIcon icon={faRotateRight} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Save snapshot as"
                  onClick={() => {
                    void props
                      .requestTextInput({
                        title: "Save Snapshot As",
                        label: "Snapshot name",
                        initialValue: state.activeSnapshotName,
                        confirmLabel: "Save"
                      })
                      .then((nextName) => {
                        if (!nextName) {
                          return;
                        }
                        setMenuOpen(false);
                        void kernel.projectService.saveSnapshotAs(nextName).then(refreshSnapshots);
                      });
                  }}
                >
                  <FontAwesomeIcon icon={faBookmark} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Rename snapshot"
                  onClick={() => {
                    void props
                      .requestTextInput({
                        title: "Rename Snapshot",
                        label: "Snapshot name",
                        initialValue: state.activeSnapshotName,
                        confirmLabel: "Rename"
                      })
                      .then((nextName) => {
                        if (!nextName) {
                          return;
                        }
                        setMenuOpen(false);
                        void kernel.projectService.renameSnapshot(state.activeSnapshotName, nextName).then(refreshSnapshots);
                      });
                  }}
                >
                  <FontAwesomeIcon icon={faPenToSquare} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Set as default snapshot"
                  onClick={() => {
                    setMenuOpen(false);
                    void kernel.projectService.setDefaultSnapshot();
                  }}
                >
                  <FontAwesomeIcon icon={faStar} />
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Delete snapshot"
                  onClick={() => {
                    const confirmed = window.confirm(`Delete snapshot "${state.activeSnapshotName}"?`);
                    if (!confirmed) {
                      return;
                    }
                    setMenuOpen(false);
                    void kernel.projectService.deleteSnapshot(state.activeSnapshotName).then(refreshSnapshots);
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
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


