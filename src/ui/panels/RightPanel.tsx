import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";
import { InspectorPane } from "@/ui/components/InspectorPane";

export function RightPanel() {
  const kernel = useKernel();
  const selection = useAppStore((store) => store.state.selection);
  const status = useAppStore((store) => store.state.statusMessage);
  const dirty = useAppStore((store) => store.state.dirty);
  const plugins = kernel.pluginApi.listPlugins();

  return (
    <div className="right-panel">
      <section className="panel-section">
        <header>
          <h3>Inspector</h3>
        </header>
        <InspectorPane />
      </section>
      <section className="panel-section">
        <header>
          <h3>Selection</h3>
        </header>
        <p>{selection.length === 0 ? "Nothing selected." : `${selection.length} item(s) selected`}</p>
      </section>
      <section className="panel-section">
        <header>
          <h3>Status</h3>
        </header>
        <p>{status}</p>
        <p>{dirty ? "Unsaved changes" : "Saved"}</p>
      </section>
      <section className="panel-section">
        <header>
          <h3>Plugins</h3>
        </header>
        {plugins.length === 0 ? (
          <p>No plugins loaded.</p>
        ) : (
          <ul className="plugin-list">
            {plugins.map((entry) => (
              <li key={entry.definition.id}>
                <strong>{entry.manifest?.name ?? entry.definition.name}</strong>
                <span>{entry.manifest?.version ?? "unknown version"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
