interface DrillInRowProps {
  label: string;
  summary?: string;
  onClick: () => void;
}

export function DrillInRow({ label, summary, onClick }: DrillInRowProps) {
  return (
    <button type="button" className="inspector-drill-row" onClick={onClick}>
      <span className="inspector-drill-label">{label}</span>
      {summary !== undefined && <span className="inspector-drill-summary">{summary}</span>}
      <span className="inspector-drill-chevron">›</span>
    </button>
  );
}
