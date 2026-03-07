import { BUILD_INFO, formatBuildTimestamp } from "@/app/buildInfo";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

interface AboutRowProps {
  label: string;
  value: string;
}

function AboutRow(props: AboutRowProps) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </>
  );
}

export function AboutModal(props: AboutModalProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div
      className="about-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className="about-modal" role="dialog" aria-modal="true" aria-label="About Simularca">
        <h3>About Simularca</h3>
        <p className="about-modal-summary">{BUILD_INFO.commitSubject}</p>
        <dl className="about-modal-grid">
          <AboutRow label="Version" value={BUILD_INFO.version} />
          <AboutRow label="Base Version" value={BUILD_INFO.baseVersion} />
          <AboutRow label="Build Kind" value={BUILD_INFO.buildKind} />
          <AboutRow label="Build Time" value={formatBuildTimestamp(BUILD_INFO.buildTimestampIso)} />
          <AboutRow label="Commits Since Anchor" value={String(BUILD_INFO.commitsSinceAnchor)} />
          <AboutRow label="Commit" value={BUILD_INFO.commitShortSha || "Unknown"} />
          <AboutRow label="Commit SHA" value={BUILD_INFO.commitSha || "Unknown"} />
        </dl>
        <div className="about-modal-actions">
          <button type="button" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
