import { InspectorFieldRow } from "@/ui/widgets/InspectorFieldRow";
import { ReferencePicker, type ReferencePickerOption } from "@/ui/widgets/ReferencePicker";

interface ActorRefListFieldProps {
  label: string;
  description?: string;
  values: string[];
  options: ReferencePickerOption[];
  mixed?: boolean;
  disabled?: boolean;
  showReset?: boolean;
  onReset?: () => void;
  onChange: (values: string[]) => void;
}

export function ActorRefListField(props: ActorRefListFieldProps) {
  const selected = props.mixed ? [] : props.values;
  const optionIds = new Set(props.options.map((option) => option.id));

  const appendFromDrop = (actorId: string): void => {
    if (!optionIds.has(actorId)) {
      return;
    }
    if (selected.includes(actorId)) {
      return;
    }
    props.onChange([...selected, actorId]);
  };

  return (
    <InspectorFieldRow
      label={props.label}
      description={props.description}
      showReset={props.showReset}
      onReset={props.onReset}
      resetDisabled={props.disabled}
      resetAlign="start"
    >
      <ReferencePicker
        selectionMode="multiple"
        selectedIds={selected}
        options={props.options}
        placeholder="No actors selected"
        disabled={props.disabled}
        dropLabel="Drop actor(s) here"
        canDrop={!props.disabled}
        onDropId={appendFromDrop}
        onChange={(nextIds) => {
          props.onChange(nextIds);
        }}
      />
    </InspectorFieldRow>
  );
}
