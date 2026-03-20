import { GlobalPullToRefresh } from "@/components/global-pull-to-refresh";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

import App from "./App.tsx";
import { Provider } from "./provider.tsx";
import "@/styles/globals.css";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider>
      <>
    <GlobalPullToRefresh />
    <App />
  </>
    </Provider>
  </BrowserRouter>,
);
