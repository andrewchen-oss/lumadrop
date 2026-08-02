import { lazy, Suspense, useState } from "react";

import { InstallInstructions } from "./components/InstallInstructions";
import { Landing } from "./components/Landing";
import { usePwaExperience } from "./hooks/usePwaExperience";

const loadSenderPanel = () => import("./components/SenderPanel");
const loadReceiverPanel = () => import("./components/ReceiverPanel");
const SenderPanel = lazy(() => loadSenderPanel().then((module) => ({ default: module.SenderPanel })));
const ReceiverPanel = lazy(() => loadReceiverPanel().then((module) => ({ default: module.ReceiverPanel })));

type AppMode = "home" | "send" | "receive";

export default function App() {
  const [mode, setMode] = useState<AppMode>("home");
  const pwa = usePwaExperience();

  return (
    <div className="app-frame">
      <header className="site-header">
        <button className="brand" onClick={() => setMode("home")} aria-label="LumaDrop home">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <span>LumaDrop</span>
        </button>
        <div className="header-meta">
          <span className={`offline-badge${pwa.offlineReady ? " is-ready" : ""}`}>
            <i /> {pwa.offlineReady ? "Ready offline" : "Preparing offline"}
          </span>
          <span className="build-label">Installable · MVP</span>
        </div>
      </header>

      {mode === "home" && (
        <Landing
          onChooseMode={setMode}
          onPreloadSend={() => void loadSenderPanel()}
          onPreloadReceive={() => void loadReceiverPanel()}
          installed={pwa.installed}
          isIos={pwa.isIos}
          offlineReady={pwa.offlineReady}
          onInstall={() => void pwa.requestInstall()}
        />
      )}
      <Suspense fallback={<main className="page-shell route-loading"><span className="spinner" /> Opening optical tools…</main>}>
        {mode === "send" && <SenderPanel onBack={() => setMode("home")} />}
        {mode === "receive" && <ReceiverPanel onBack={() => setMode("home")} />}
      </Suspense>

      <footer className="site-footer">
        <span>© LumaDrop</span>
        <span>No account. No cloud. Data stays.</span>
      </footer>

      <InstallInstructions
        isIos={pwa.isIos}
        onClose={pwa.closeInstructions}
        open={pwa.instructionsOpen}
      />
    </div>
  );
}
