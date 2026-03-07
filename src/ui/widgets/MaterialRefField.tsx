import React from "react";
import { useAppStore } from "@/app/useAppStore";
import { Material } from "@/core/types";
import { InspectorFieldRow } from "@/ui/widgets/InspectorFieldRow";
import { ReferencePicker, type ReferencePickerOption } from "@/ui/widgets/ReferencePicker";

interface MaterialRefFieldProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label?: string;
  description?: string;
  placeholder?: string;
  extraMaterials?: Record<string, Material>;
}

const MaterialRefFieldImpl: React.FC<MaterialRefFieldProps> = ({
  value,
  onChange,
  label,
  description,
  placeholder = "None (Default)",
  extraMaterials
}) => {
  const materials = useAppStore((s) => s.state.materials);
  // Memoize sort — localeCompare on 100 items is expensive and materials rarely change.
  const materialList = React.useMemo<ReferencePickerOption[]>(
    () => {
      const localIds = new Set(Object.keys(extraMaterials ?? {}));
      const merged = extraMaterials ? { ...extraMaterials, ...materials } : materials;
      return Object.values(merged)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((mat) => ({
          id: mat.id,
          label: mat.name,
          detail: `${localIds.has(mat.id) ? "Local" : "Global"} material${mat.transparent ? " · transparent" : ""}${
            mat.wireframe ? " · wireframe" : ""
          }`,
          kindLabel: localIds.has(mat.id) ? "LOCAL" : "GLOBAL",
          searchText: `${mat.name} ${mat.id}`,
          swatchColor: mat.albedo.mode === "color" ? mat.albedo.color : null
        }));
    },
    [materials, extraMaterials]
  );

  const picker = (
    <ReferencePicker
      selectionMode="single"
      selectedIds={value ? [value] : []}
      options={materialList}
      placeholder={placeholder}
      onChange={(nextIds) => onChange(nextIds[0] || undefined)}
    />
  );

  if (!label) {
    return <div className="widget-material-ref">{picker}</div>;
  }

  return (
    <InspectorFieldRow label={label} description={description}>
      <div className="widget-material-ref">{picker}</div>
    </InspectorFieldRow>
  );
};

// Memo with custom comparator: skip re-render when only onChange changes.
// onChange is always a new closure from the parent's map(), but value/label are stable
// when material assignments haven't changed. If value changes (user picks a material),
// the comparator returns false and the component re-renders with a fresh onChange.
export const MaterialRefField = React.memo(MaterialRefFieldImpl, (prev, next) =>
  prev.value === next.value &&
  prev.label === next.label &&
  prev.description === next.description &&
  prev.placeholder === next.placeholder &&
  prev.extraMaterials === next.extraMaterials
);
