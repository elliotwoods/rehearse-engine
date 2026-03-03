import { useEffect, useState } from "react";
import { InspectorFieldRow } from "@/ui/widgets/InspectorFieldRow";

interface ColorFieldProps {
  label: string;
  description?: string;
  value: string;
  mixed?: boolean;
  disabled?: boolean;
  showReset?: boolean;
  onReset?: () => void;
  onChange: (value: string) => void;
}

function normalizeHexColor(value: string, fallback = "#000000"): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1] ?? "0";
    const g = trimmed[2] ?? "0";
    const b = trimmed[3] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function ColorField(props: ColorFieldProps) {
  const [draft, setDraft] = useState(props.value);

  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  const safeColor = normalizeHexColor(props.value, "#000000");

  return (
    <InspectorFieldRow
      label={props.label}
      description={props.description}
      showReset={props.showReset}
      onReset={props.onReset}
      resetDisabled={props.disabled}
    >
      <div className="inspector-scene-color-row">
        <input
          type="color"
          className="inspector-color-input"
          value={safeColor}
          disabled={props.disabled}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            props.onChange(next);
          }}
        />
        <input
          type="text"
          className="widget-text"
          value={props.mixed ? "" : draft}
          placeholder={props.mixed ? "Mixed" : undefined}
          disabled={props.disabled}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (/^#[0-9a-fA-F]{6}$/.test(next) || /^#[0-9a-fA-F]{3}$/.test(next)) {
              props.onChange(next);
            }
          }}
        />
      </div>
    </InspectorFieldRow>
  );
}
