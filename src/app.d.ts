/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />
import type { Game } from '../js/game.ts';
import type { Save } from '../types/craftrush.d.ts';
import type { nav } from './lib/store.svelte.ts';

declare global {
  const __RELEASE__: {
    version: string; source: string; anchor: string; dirty: boolean;
    development: boolean; fingerprint: string;
  };
  interface Window {
    CR?: { game: Game; save: Save; nav: typeof nav; commit: () => boolean;
      togglePause: (force?: boolean) => void; assetsReady: () => boolean; paused?: boolean };
  }
}
export {};
