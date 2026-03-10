import { useMemo } from "react";
import { InspectorFieldRow } from "@/ui/widgets/InspectorFieldRow";
import { DigitScrubInput } from "@/ui/widgets/DigitScrubInput";
import { inferDisplayPrecision, normalizeCommittedNumber } from "@/ui/widgets/numberEditing";

interface NumberFieldProps {
  label: string;
  description?: string;
  value: number;
  mixed?: boolean;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  dragSpeed?: number;
  disabled?: boolean;
  showReset?: boolean;
  onReset?: () => void;
  onChange: (value: number) => void;
}

export function NumberField(props: NumberFieldProps) {
  const displayPrecision = inferDisplayPrecision(props.precision, props.step);
  const hasRange = props.min !== undefined && props.max !== undefined;

  const sliderStep = useMemo(() => {
    if (props.step && props.step > 0) {
      return props.step;
    }
    if (hasRange) {
      const span = Math.abs((props.max as number) - (props.min as number));
      return Number(Math.max(span / 250, 0.0001).toFixed(6));
    }
    return 0.01;
  }, [props.max, props.min, props.step, hasRange]);

  const progressPercent = hasRange
    ? Math.max(
        0,
        Math.min(100, ((props.value - (props.min as number)) / ((props.max as number) - (props.min as number))) * 100)
      )
    : 0;

  return (
    <InspectorFieldRow
      label={props.label}
      description={props.description}
      showReset={props.showReset}
      onReset={props.onReset}
      resetDisabled={props.disabled}
    >
      {hasRange ? (
        <div className="widget-number">
          <input
            className="widget-number-slider"
            type="range"
            min={props.min}
            max={props.max}
            step={sliderStep}
            value={props.value}
            disabled={props.disabled}
            style={{ ["--fill" as string]: `${progressPercent}%` }}
            onChange={(event) => {
              const next = normalizeCommittedNumber(Number(event.target.value), {
                min: props.min,
                max: props.max,
                step: props.step,
                precision: displayPrecision
              });
              props.onChange(next);
            }}
          />
          <div className="widget-number-input-wrap">
            <DigitScrubInput
              className="widget-digit-input-rangeless"
              value={props.value}
              mixed={props.mixed}
              precision={displayPrecision}
              min={props.min}
              max={props.max}
              step={props.step}
              disabled={props.disabled}
              onChange={props.onChange}
            />
            {props.unit ? <span className="widget-number-unit">{props.unit}</span> : null}
          </div>
        </div>
      ) : (
        <div className="widget-number-input-wrap widget-number-input-wrap-fill">
          <DigitScrubInput
            className="widget-digit-input-rangeless"
            value={props.value}
            mixed={props.mixed}
            precision={displayPrecision}
            min={props.min}
            max={props.max}
            step={props.step}
            disabled={props.disabled}
            onChange={props.onChange}
          />
          {props.unit ? <span className="widget-number-unit">{props.unit}</span> : null}
        </div>
      )}
    </InspectorFieldRow>
  );
}
