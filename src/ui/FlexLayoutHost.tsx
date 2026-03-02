import { useMemo } from "react";
import { Layout, Model, type IJsonModel, type TabNode } from "flexlayout-react";
import { LeftPanel } from "@/ui/panels/LeftPanel";
import { RightPanel } from "@/ui/panels/RightPanel";
import { ViewportPanel } from "@/ui/panels/ViewportPanel";

const LAYOUT_STORAGE_KEY = "kinetic-sim:flex-layout:v1";

function defaultLayoutConfig(): IJsonModel {
  return {
    global: {
      tabEnableClose: false,
      tabSetEnableMaximize: true
    },
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          id: "panel.left",
          weight: 22,
          children: [
            {
              type: "tab",
              id: "tab.left",
              component: "left",
              name: "Scene"
            }
          ]
        },
        {
          type: "tabset",
          id: "panel.center",
          weight: 56,
          children: [
            {
              type: "tab",
              id: "tab.viewport",
              component: "center",
              name: "Viewport"
            }
          ]
        },
        {
          type: "tabset",
          id: "panel.right",
          weight: 22,
          children: [
            {
              type: "tab",
              id: "tab.right",
              component: "right",
              name: "Inspector"
            }
          ]
        }
      ]
    }
  };
}

function loadStoredLayoutConfig(): IJsonModel | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as IJsonModel;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function createLayoutModel(): Model {
  const config = loadStoredLayoutConfig() ?? defaultLayoutConfig();
  try {
    return Model.fromJson(config);
  } catch {
    return Model.fromJson(defaultLayoutConfig());
  }
}

function persistLayoutConfig(model: Model): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(model.toJson()));
  } catch {
    // Persist is best effort.
  }
}

interface FlexLayoutHostProps {
  topBar: React.ReactNode;
}

export function FlexLayoutHost(props: FlexLayoutHostProps) {
  const model = useMemo(() => createLayoutModel(), []);

  const factory = (node: TabNode): React.ReactNode => {
    const component = node.getComponent();
    switch (component) {
      case "left":
        return <LeftPanel />;
      case "center":
        return <ViewportPanel />;
      case "right":
        return <RightPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="layout-shell">
      <div className="layout-shell-top">{props.topBar}</div>
      <div className="flex-layout-host">
        <Layout model={model} factory={factory} onModelChange={persistLayoutConfig} />
      </div>
    </div>
  );
}
