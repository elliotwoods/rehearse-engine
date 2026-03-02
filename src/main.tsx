import ReactDOM from "react-dom/client";
import "flexlayout-react/style/dark.css";
import "@/styles.css";
import { App } from "@/app/App";
import { getKernel } from "@/app/kernel";
import { KernelProvider } from "@/app/KernelContext";

const kernel = getKernel();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <KernelProvider kernel={kernel}>
    <App />
  </KernelProvider>
);

