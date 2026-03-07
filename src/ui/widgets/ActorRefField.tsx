import { InspectorFieldRow } from "@/ui/widgets/InspectorFieldRow";
import { ReferencePicker, type ReferencePickerOption } from "@/ui/widgets/ReferencePicker";

interface ActorRefFieldProps {
  label: string;
  description?: string;
  value: string;
  options: ReferencePickerOption[];
  mixed?: boolean;
  disabled?: boolean;
  showReset?: boolean;
  onReset?: () => void;
  onChange: (value: string) => void;
}

export function ActorRefField(props: ActorRefFieldProps) {
  const selectedValue = props.mixed ? [] : props.value ? [props.value] : [];

  return (
    <InspectorFieldRow
      label={props.label}
      description={props.description}
      showReset={props.showReset}
      onReset={props.onReset}
      resetDisabled={props.disabled}
    >
      <ReferencePicker
        selectionMode="single"
        selectedIds={selectedValue}
        options={props.options}
        placeholder="(none)"
        disabled={props.disabled}
        dropLabel="Drop actor here"
        canDrop={!props.disabled}
        onDropId={(nextId) => {
          props.onChange(nextId);
        }}
        onChange={(nextIds) => {
          props.onChange(nextIds[0] ?? "");
        }}
      />
    </InspectorFieldRow>
  );
}
