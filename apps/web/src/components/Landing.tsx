import { ArrowUpRight, Camera, Check, Download, FileUp, ShieldCheck, Smartphone, WifiOff } from "lucide-react";

type LandingProps = {
  installed: boolean;
  isIos: boolean;
  onChooseMode: (mode: "send" | "receive") => void;
  onInstall: () => void;
  onPreloadReceive: () => void;
  onPreloadSend: () => void;
  offlineReady: boolean;
};

export function Landing({
  installed,
  isIos,
  offlineReady,
  onChooseMode,
  onInstall,
  onPreloadReceive,
  onPreloadSend,
}: LandingProps) {
  return (
    <main className="landing page-shell">
      <section className="hero">
        <div className="eyebrow"><span /> Device-to-device transfer</div>
        <h1>Move files<br />through <em>light.</em></h1>
        <p className="hero-copy">
          No cloud. No account. No pairing. Your screen becomes the connection.
        </p>
      </section>

      <section className="mode-grid" aria-label="Choose a transfer mode">
        <button
          className="mode-card mode-card-send"
          onClick={() => onChooseMode("send")}
          onFocus={onPreloadSend}
          onPointerEnter={onPreloadSend}
        >
          <span className="mode-number">01</span>
          <span className="mode-icon"><FileUp size={29} /></span>
          <span className="mode-content">
            <strong>Send a file</strong>
            <small>Turn it into animated light</small>
          </span>
          <ArrowUpRight className="mode-arrow" size={25} />
        </button>

        <button
          className="mode-card mode-card-receive"
          onClick={() => onChooseMode("receive")}
          onFocus={onPreloadReceive}
          onPointerEnter={onPreloadReceive}
        >
          <span className="mode-number">02</span>
          <span className="mode-icon"><Camera size={29} /></span>
          <span className="mode-content">
            <strong>Receive a file</strong>
            <small>Scan another screen</small>
          </span>
          <ArrowUpRight className="mode-arrow" size={25} />
        </button>
      </section>

      <section className={`install-card${installed ? " is-installed" : ""}`} aria-labelledby="install-card-title">
        <div className="install-card-icon" aria-hidden="true">
          {installed ? <Check size={27} /> : <Smartphone size={27} />}
        </div>
        <div className="install-card-copy">
          <span>{installed ? "Installed on this device" : "One-time setup"}</span>
          <h2 id="install-card-title">{installed ? "LumaDrop is ready from your home screen." : "Install once. Transfer offline."}</h2>
          <p>
            {installed
              ? "Open it like any other app—your transfer tools stay on this device."
              : "Add LumaDrop to your home screen. After this first visit, it opens like an app without a browser or account."}
          </p>
        </div>
        <div className="install-card-action">
          <span className={`cache-status${offlineReady ? " is-ready" : ""}`}>
            <i /> {offlineReady ? "Offline tools saved" : "Saving offline tools…"}
          </span>
          <button className="install-button" onClick={onInstall} disabled={installed} type="button">
            {installed ? <Check size={17} /> : <Download size={17} />}
            {installed ? "Installed" : isIos ? "How to install" : "Install LumaDrop"}
          </button>
          <small>No login · No app store</small>
        </div>
      </section>

      <section className="trust-row" aria-label="How LumaDrop works">
        <div><WifiOff size={17} /><span><strong>Offline by design</strong>No network required</span></div>
        <div><ShieldCheck size={17} /><span><strong>Private transfer</strong>Nothing is uploaded</span></div>
        <div className="protocol-mark"><span className="pulse-dot" /> Protocol v1 · Lab build</div>
      </section>
    </main>
  );
}
