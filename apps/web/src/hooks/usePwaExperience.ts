import { useCallback, useEffect, useState } from "react";

type InstallOutcome = "accepted" | "dismissed";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function usePwaExperience() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isIos] = useState(isIosDevice);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstructionsOpen(false);
    };

    const handleOfflineReady = () => setOfflineReady(true);

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("lumadrop-offline-ready", handleOfflineReady);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("lumadrop-offline-ready", handleOfflineReady);
    };
  }, []);

  const requestInstall = useCallback(async () => {
    if (installed) return;

    if (!installPrompt) {
      setInstructionsOpen(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
  }, [installPrompt, installed]);

  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);

  return {
    installed,
    instructionsOpen,
    isIos,
    offlineReady,
    requestInstall,
    closeInstructions,
  };
}
