import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";

export interface ReferencePickerOption {
  id: string;
  label: string;
  detail?: string;
  searchText?: string;
  kindLabel?: string;
  swatchColor?: string | null;
}

interface ReferencePickerProps {
  selectionMode: "single" | "multiple";
  selectedIds: string[];
  options: ReferencePickerOption[];
  placeholder: string;
  disabled?: boolean;
  dropLabel?: string;
  emptyResultsLabel?: string;
  canDrop?: boolean;
  onDropId?: (id: string) => void;
  onChange: (nextIds: string[]) => void;
}

function filterOptions(options: ReferencePickerOption[], query: string): ReferencePickerOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return options;
  }
  return options.filter((option) => {
    const haystack = `${option.label} ${option.detail ?? ""} ${option.kindLabel ?? ""} ${option.searchText ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function ReferencePicker(props: ReferencePickerProps) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isDragActive, setDragActive] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const optionById = useMemo(() => new Map(props.options.map((option) => [option.id, option])), [props.options]);
  const selectedOptions = useMemo(
    () =>
      props.selectedIds.map((id) => {
        const option = optionById.get(id);
        return option ?? { id, label: id, detail: "Missing reference" };
      }),
    [optionById, props.selectedIds]
  );
  const filteredOptions = useMemo(() => filterOptions(props.options, query), [props.options, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }
    searchInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen]);

  const applySingleSelection = (id: string | null): void => {
    props.onChange(id ? [id] : []);
    setOpen(false);
  };

  const toggleMultiSelection = (id: string): void => {
    if (props.selectedIds.includes(id)) {
      props.onChange(props.selectedIds.filter((entry) => entry !== id));
      return;
    }
    props.onChange([...props.selectedIds, id]);
  };

  const renderSummary = () => {
    if (selectedOptions.length === 0) {
      return (
        <div className="reference-picker-summary is-empty">
          <span className="reference-picker-placeholder">{props.dropLabel ?? props.placeholder}</span>
        </div>
      );
    }
    if (props.selectionMode === "single") {
      const selected = selectedOptions[0];
      return (
        <div className="reference-picker-summary">
          {selected?.swatchColor ? (
            <span className="reference-picker-swatch" style={{ backgroundColor: selected.swatchColor }} aria-hidden="true" />
          ) : null}
          <div className="reference-picker-summary-text">
            <span className="reference-picker-summary-label">{selected?.label ?? props.placeholder}</span>
            {selected?.detail ? <span className="reference-picker-summary-detail">{selected.detail}</span> : null}
          </div>
        </div>
      );
    }
    const visible = selectedOptions.slice(0, 3);
    const remaining = selectedOptions.length - visible.length;
    return (
      <div className="reference-picker-summary reference-picker-summary-multi">
        {visible.map((option) => (
          <span key={option.id} className="reference-picker-chip">
            {option.label}
          </span>
        ))}
        {remaining > 0 ? <span className="reference-picker-chip is-muted">+{remaining} more</span> : null}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className={`reference-picker${isOpen ? " is-open" : ""}${isDragActive ? " is-drag-active" : ""}${
        props.disabled ? " is-disabled" : ""
      }`}
      onDragOver={(event) => {
        if (!props.canDrop || props.disabled) {
          return;
        }
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => {
        setDragActive(false);
      }}
      onDrop={(event) => {
        if (!props.canDrop || props.disabled || !props.onDropId) {
          return;
        }
        event.preventDefault();
        setDragActive(false);
        const droppedId = event.dataTransfer.getData("text/plain");
        if (!droppedId) {
          return;
        }
        props.onDropId(droppedId);
      }}
    >
      <button
        type="button"
        className="reference-picker-trigger"
        disabled={props.disabled}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {renderSummary()}
        <span className="reference-picker-trigger-icon">
          <FontAwesomeIcon icon={faChevronDown} />
        </span>
      </button>
      {isOpen ? (
        <div className="reference-picker-popover">
          <div className="reference-picker-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              placeholder="Type to search"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
            />
          </div>

          {selectedOptions.length > 0 ? (
            <div className="reference-picker-selected-list">
              {selectedOptions.map((option) => (
                <div key={option.id} className="reference-picker-selected-item">
                  <div className="reference-picker-option-main">
                    {option.swatchColor ? (
                      <span className="reference-picker-swatch" style={{ backgroundColor: option.swatchColor }} aria-hidden="true" />
                    ) : null}
                    <div className="reference-picker-option-text">
                      <span className="reference-picker-option-label">{option.label}</span>
                      {option.detail ? <span className="reference-picker-option-detail">{option.detail}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="reference-picker-selected-remove"
                    title={`Remove ${option.label}`}
                    onClick={() => {
                      if (props.selectionMode === "single") {
                        applySingleSelection(null);
                        return;
                      }
                      props.onChange(props.selectedIds.filter((entry) => entry !== option.id));
                    }}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {props.selectionMode === "single" ? (
            <button
              type="button"
              className={`reference-picker-option${props.selectedIds.length === 0 ? " is-selected" : ""}`}
              onClick={() => applySingleSelection(null)}
            >
              <div className="reference-picker-option-main">
                <div className="reference-picker-option-text">
                  <span className="reference-picker-option-label">{props.placeholder}</span>
                  <span className="reference-picker-option-detail">Clear this reference</span>
                </div>
              </div>
              {props.selectedIds.length === 0 ? (
                <span className="reference-picker-option-check">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
              ) : null}
            </button>
          ) : null}

          <div className="reference-picker-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = props.selectedIds.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`reference-picker-option${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      if (props.selectionMode === "single") {
                        applySingleSelection(option.id);
                        return;
                      }
                      toggleMultiSelection(option.id);
                    }}
                  >
                    <div className="reference-picker-option-main">
                      {option.swatchColor ? (
                        <span className="reference-picker-swatch" style={{ backgroundColor: option.swatchColor }} aria-hidden="true" />
                      ) : null}
                      <div className="reference-picker-option-text">
                        <span className="reference-picker-option-label">{option.label}</span>
                        {option.detail ? <span className="reference-picker-option-detail">{option.detail}</span> : null}
                      </div>
                    </div>
                    {option.kindLabel ? <span className="reference-picker-option-kind">{option.kindLabel}</span> : null}
                    {isSelected ? (
                      <span className="reference-picker-option-check">
                        <FontAwesomeIcon icon={faCheck} />
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="reference-picker-empty">{props.emptyResultsLabel ?? "No matching options."}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
