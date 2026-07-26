// Tutorial toasts. One line, at the right moment, then gone.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { persistSave } from '../config.js';

export const ToastMixin = {
  // ---------- toasts ----------
  toast(kind) {
    const T = this.els.toast;
    clearTimeout(this._toastTimer);
    if (!kind) { T.classList.add('hidden'); return; }
    T.textContent = kind === 'steer' ? 'DRAG ANYWHERE TO STEER!' : 'GOLEM CHARGED — HERE IT COMES!';
    T.classList.remove('hidden');
    if (kind === 'steer') persistSave(this.save);
    this._toastTimer = setTimeout(() => T.classList.add('hidden'), 3500);
  },
};
