interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

// Capture once with the shell, so opening Settings later cannot miss the
// browser's one-shot offer. Nothing prompts without a tap.
export const install = $state<{ pending: InstallPrompt | null; ios: boolean; standalone: boolean }>({
  pending: null, ios: false, standalone: false,
});

export function trackInstall() {
  const standalone = window.matchMedia('(display-mode: standalone)');
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const syncMode = () => {
    install.standalone = standalone.matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  };
  install.ios = apple;
  syncMode();
  const beforeInstall = (event: Event) => {
    if (install.standalone || !('prompt' in event) || typeof event.prompt !== 'function') return;
    event.preventDefault();
    install.pending = event as InstallPrompt;
  };
  const installed = () => {
    install.pending = null;
    install.standalone = true;
  };
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', installed);
  standalone.addEventListener('change', syncMode);
  return () => {
    window.removeEventListener('beforeinstallprompt', beforeInstall);
    window.removeEventListener('appinstalled', installed);
    standalone.removeEventListener('change', syncMode);
    install.pending = null;
  };
}

export async function promptInstall() {
  const pending = install.pending;
  if (!pending || install.standalone) return false;
  install.pending = null;
  await pending.prompt();
  return true;
}
