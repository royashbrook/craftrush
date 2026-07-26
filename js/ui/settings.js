// Save and data: the export code, the file download, and the daily backups.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { dayStamp, exportSave, listBackups, restoreBackup } from '../config.js';

export const SettingsMixin = {
  // hand the player an actual file instead of asking a kid to copy a wall of text
  downloadSave() {
    const code = exportSave(this.save);
    const name = `craftrush-save-${dayStamp(Date.now())}.txt`;
    try {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.els.setMsg.textContent = `Saved ${name}`;
    } catch {
      this.els.saveExport.classList.remove('hidden'); // fall back to the code
      this.els.setMsg.textContent = 'Could not save a file — copy the code instead.';
    }
  },
  renderBackups() {
    const list = this.els.backupList;
    list.innerHTML = '';
    const backups = listBackups();
    if (!backups.length) {
      const d = document.createElement('div');
      d.className = 'backupEmpty';
      d.textContent = 'No backups yet — one is kept each day you beat a level.';
      list.appendChild(d);
      return;
    }
    for (const b of backups) {
      const row = document.createElement('button');
      row.className = 'backupRow';
      const day = document.createElement('span'); day.className = 'bDay'; day.textContent = b.day;
      const meta = document.createElement('span'); meta.className = 'bMeta';
      meta.textContent = `LV ${b.level} · ${b.emeralds}`;
      row.append(day, meta);
      row.addEventListener('click', () => {
        if (!confirm(`Go back to your ${b.day} save (level ${b.level})? Your current progress will be replaced.`)) return;
        if (restoreBackup(b.day)) { this.els.setMsg.textContent = 'Restored! Reloading…'; setTimeout(() => location.reload(), 700); }
        else this.els.setMsg.textContent = 'That backup could not be read.';
      });
      list.appendChild(row);
    }
  },
  showSettings() {
    this.els.saveExport.value = exportSave(this.save);
    this.els.saveImport.value = '';
    this.els.setMsg.textContent = '';
    this.renderBackups();
    this.openScreen('settings');
    this.paintIcons(this.els.settings);
  },
};
