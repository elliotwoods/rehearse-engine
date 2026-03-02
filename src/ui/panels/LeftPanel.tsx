import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";
import { SceneTree } from "@/ui/components/SceneTree";

export function LeftPanel() {
  const kernel = useKernel();
  const stats = useAppStore((store) => store.state.stats);
  const selection = useAppStore((store) => store.state.selection);
  const mode = useAppStore((store) => store.state.mode);
  const readOnly = mode === "web-ro";

  return (
    <div className="left-panel">
      <section className="panel-section">
        <header>
          <h3>Scene Graph</h3>
          <div className="inline-actions">
            <button
              type="button"
              disabled={readOnly}
              title="Create Empty Actor"
              onClick={() => kernel.store.getState().actions.createActor({ actorType: "empty", name: "Empty" })}
            >
              + Empty
            </button>
            <button
              type="button"
              disabled={readOnly}
              title="Create Environment Actor"
              onClick={() => kernel.store.getState().actions.createActor({ actorType: "environment", name: "Environment" })}
            >
              + Env
            </button>
          </div>
        </header>
        <SceneTree />
      </section>

      <section className="panel-section">
        <header>
          <h3>Scene Stats</h3>
        </header>
        <dl className="stats-list">
          <div>
            <dt>FPS</dt>
            <dd>{stats.fps.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Draw Calls</dt>
            <dd>{stats.drawCalls}</dd>
          </div>
          <div>
            <dt>Triangles</dt>
            <dd>{stats.triangles}</dd>
          </div>
          <div>
            <dt>Memory MB</dt>
            <dd>{stats.memoryMb.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Actors</dt>
            <dd>{stats.actorCount}</dd>
          </div>
          <div>
            <dt>Session Bytes</dt>
            <dd>{stats.sessionFileBytes}</dd>
          </div>
          <div>
            <dt>Selection</dt>
            <dd>{selection.length}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

