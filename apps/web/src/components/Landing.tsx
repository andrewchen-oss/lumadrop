import { ArrowUpRight, Camera, FileUp, ShieldCheck, WifiOff } from "lucide-react";

type LandingProps = {
  onChooseMode: (mode: "send" | "receive") => void;
  onPreloadReceive: () => void;
  onPreloadSend: () => void;
};

export function Landing({ onChooseMode, onPreloadReceive, onPreloadSend }: LandingProps) {
  return (
    <main className="landing page-shell">
      <section className="hero">
        <div className="eyebrow"><span /> Device-to-device transfer</div>
        <h1>Move files<br />through <em>light.</em></h1>
        <p className="hero-copy">
          No cloud. No pairing. Your screen becomes the connection.
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

      <section className="trust-row" aria-label="How LumaDrop works">
        <div><WifiOff size={17} /><span><strong>Offline by design</strong>No network required</span></div>
        <div><ShieldCheck size={17} /><span><strong>Private transfer</strong>Nothing is uploaded</span></div>
        <div className="protocol-mark"><span className="pulse-dot" /> Protocol v1 · Lab build</div>
      </section>
    </main>
  );
}
