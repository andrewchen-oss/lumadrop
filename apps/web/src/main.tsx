import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

async function prepareOfflineApp() {
  try {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true })),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
      ]);
    }

    await Promise.allSettled([
      import("./components/SenderPanel"),
      import("./components/ReceiverPanel"),
    ]);

    window.dispatchEvent(new Event("lumadrop-offline-ready"));
  } catch (error) {
    console.warn("LumaDrop could not finish offline setup.", error);
  }
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void prepareOfflineApp(), { once: true });
}
