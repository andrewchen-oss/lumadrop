import { lazy, Suspense, useState } from "react";

import { Landing } from "./components/Landing";

const loadSenderPanel = () => import("./components/SenderPanel");
const loadReceiverPanel = () => import("./components/ReceiverPanel");
const SenderPanel = lazy(() => loadSenderPanel().then((module) => ({ default: module.SenderPanel })));
const ReceiverPanel = lazy(() => loadReceiverPanel().then((module) => ({ default: module.ReceiverPanel })));

type AppMode = "home" | "send" | "receive";

export default function App() {
  const [mode, setMode] = useState<AppMode>("home");

  return (
    <div className="app-frame">
      <header className="site-header">
        <button className="brand" onClick={() => setMode("home")} aria-label="LumaDrop home">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <span>LumaDrop</span>
        </button>
        <div className="header-meta">
          <span className="offline-badge"><i /> Offline ready</span>
          <span className="build-label">MVP · 01</span>
        </div>
      </header>

      {mode === "home" && (
        <Landing
          onChooseMode={setMode}
          onPreloadSend={() => void loadSenderPanel()}
          onPreloadReceive={() => void loadReceiverPanel()}
        />
      )}
      <Suspense fallback={<main className="page-shell route-loading"><span className="spinner" /> Opening optical tools…</main>}>
        {mode === "send" && <SenderPanel onBack={() => setMode("home")} />}
        {mode === "receive" && <ReceiverPanel onBack={() => setMode("home")} />}
      </Suspense>

      <footer className="site-footer">
        <span>© LumaDrop</span>
        <span>Files move. Data stays.</span>
      </footer>
    </div>
  );
}
