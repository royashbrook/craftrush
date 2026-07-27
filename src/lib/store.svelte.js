// The one place UI state lives.
//
// The save is a $state proxy and the SAME object the engine was handed, so when
// a run banks emeralds or finishes a chapter the screens showing those numbers
// update on their own. That is the point of the port: the old code had a
// `refresh` hook that every screen entry had to remember to call, and forgetting
// it was the recurring bug (stale prices after a back, blank tabs). There is
// nothing left to forget.
import { loadSave, persistSave, migrateWorld } from '../../js/config.js';

/** @type {import('../../types/craftrush.js').Save} */
export const save = $state(loadSave());

// Run the world migration ONCE, here, before anything renders. It mutates the
// save, so calling it from inside a $derived would write the state that derived
// reads and loop forever. After this, everything just reads save.world.
migrateWorld(save);

/** The world record: towns, which one you are in, which house. */
export const world = () => save.world;

/** Write to localStorage. Reads are reactive; saving is deliberate. */
export function commit() {
  persistSave(save);
}

/**
 * Which screen is showing, and how you got there.
 *
 * `stack` is the trail of screens behind the current one, so BACK works
 * everywhere without any screen knowing who opened it. A tab switch clears it,
 * because a tab is a fresh start rather than a step deeper.
 */
export const nav = $state({
  screen: 'menu',
  stack: [],
  playing: false,     // a run is on: chrome hides, canvas takes the screen
  paused: false,
  toast: null,        // tutorial line, or null
  result: null,       // the run that just ended, or null
  achPop: null,       // achievement just earned, or null
  hud: null,          // the engine pushes run state here every frame
});

/** What each screen is: which tab owns it, what the bar says, who it sits under. */
export const SCREENS = {
  menu:      { tab: 'play',  title: 'CraftRush' },
  // Pause is a screen, not a flag. That is what lets you step from a paused run
  // into the shop and have BACK bring you back to the pause menu rather than
  // dumping you out of the run.
  pause:     { title: 'Paused' },
  shop:      { tab: 'shop',  title: 'Skins & Shop' },
  home:      { tab: 'home',  title: 'Your Village' },
  world:     { tab: 'world', title: 'World' },
  town:      { tab: 'world', title: 'Town', parent: 'world' },
  playroom:  { tab: 'world', title: 'House', parent: 'world' },
  mine:      { tab: 'mine',  title: 'The Mine' },
  more:      { title: 'More', parent: 'menu' },
  about:     { title: 'About', parent: 'more' },
  goals:     { title: 'Goals', parent: 'more' },
  settings:  { title: 'Save & Data', parent: 'more' },
};

/**
 * Navigate. `push` remembers where you came from so BACK can return there.
 *
 * A screen with a parent always pushes. Passing `push: true` explicitly forces
 * it even when the target has no parent, which is how stepping from a paused
 * run into the shop still comes back to the pause menu.
 */
export function go(screen, { push } = {}) {
  if (screen === nav.screen) return;
  const def = SCREENS[screen] || {};
  if (push === true || (push !== false && def.parent)) nav.stack = [...nav.stack, nav.screen];
  else nav.stack = [];
  nav.screen = screen;
}

export function back() {
  if (nav.stack.length) {
    const prev = nav.stack[nav.stack.length - 1];
    nav.stack = nav.stack.slice(0, -1);
    nav.screen = prev;
    return true;
  }
  const parent = (SCREENS[nav.screen] || {}).parent;
  if (parent) { nav.screen = parent; return true; }
  return false;
}

export const canGoBack = () => nav.stack.length > 0 || !!(SCREENS[nav.screen] || {}).parent;

/** Show a tutorial line. Passing null clears it. */
let toastTimer = null;
export function toast(text) {
  clearTimeout(toastTimer);
  nav.toast = text;
  if (text) toastTimer = setTimeout(() => { nav.toast = null; }, 3500);
}

/**
 * Open or close the pause menu.
 *
 * Pausing remembers which screen you were on so resuming puts you back, and
 * stepping from a paused run into the shop leaves the run suspended underneath.
 */
let beforePause = 'menu';
export function togglePause(force) {
  const open = force ?? !nav.paused;
  if (open) {
    if (!nav.paused) beforePause = nav.screen;
    nav.paused = true;
    nav.screen = 'pause';
    nav.stack = [];
  } else {
    nav.paused = false;
    nav.screen = beforePause;
  }
}

/**
 * Make the system back gesture walk the screen stack.
 *
 * On Android an installed PWA gets a real back button, and without this it
 * closes the game instead of stepping up a screen, which is a horrible surprise
 * mid-play. Rather than mirror the whole stack into history, we keep exactly one
 * spare entry armed: a back gesture pops it, we handle it and re-arm. When there
 * is nothing left to go back to we do NOT re-arm, so the next back really does
 * leave the app, which is what someone at the menu expects.
 */
export function initHistory(pushState) {
  if (typeof window === 'undefined') return;
  // SvelteKit owns the history stack, so the shallow-routing pushState from
  // $app/navigation is passed in rather than calling history.pushState directly,
  // which the router warns about and would eventually fight us over.
  const arm = () => pushState('', { cr: true });
  arm();
  window.addEventListener('popstate', () => {
    // mid-run, back means "wait, stop" rather than "go somewhere"
    if (nav.playing && !nav.paused) { togglePause(true); arm(); return; }
    if (back()) { arm(); return; }
    if (nav.screen !== 'menu') { go('menu', { push: false }); arm(); return; }
    // at the menu with nothing behind it: let the gesture close the app
  });
}
