import { useKernel } from "@/app/useKernel";
import { createActorFromDescriptor, listActorCreationOptions } from "@/features/actors/actorCatalog";

interface AddActorMenuProps {
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function AddActorMenu(props: AddActorMenuProps) {
  const kernel = useKernel();
  const options = listActorCreationOptions(kernel);

  return (
    <select
      className={props.className}
      disabled={props.disabled}
      defaultValue=""
      title="Add actor"
      onChange={(event) => {
        const descriptorId = event.target.value;
        if (!descriptorId) {
          return;
        }
        const createdId = createActorFromDescriptor(kernel, descriptorId);
        if (!createdId) {
          kernel.store.getState().actions.setStatus(`Unable to create actor from descriptor: ${descriptorId}`);
        }
        event.currentTarget.value = "";
      }}
    >
      <option value="">{props.label ?? "Add..."}</option>
      {options.map((option) => (
        <option key={option.descriptorId} value={option.descriptorId}>
          {option.pluginBacked ? `${option.label} (Plugin)` : option.label}
        </option>
      ))}
    </select>
  );
}
