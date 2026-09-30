# save recovery: threat model and decision record

Tracked by [#100](https://github.com/royashbrook/craftrush/issues/100). This is
the record the issue asks for before implementation. It decides what to build
next and what not to build; it does not claim anything has shipped.

## what exists today

The live save is one `localStorage` key, `craftrush_save_v1`, in whichever
browser or Home Screen container runs the game (`js/config.ts`). Beside it, in
the same container, sit seven daily backups (`craftrush_backups_v1`, written by
`js/settlement.ts` only after a level clear persists) and the bytes from before
the last restore (`craftrush_pre_restore_v1`). All three share one fate: they
protect against a bad write or a bad restore, not against losing the container.

Leaving the container is manual. Save & Data (`src/screens/Settings.svelte`) and
the standalone rescue page (`js/rescue-entry.ts`) offer a `CR1|` code to the
clipboard, a downloaded file, and a QR code that links to `rescue.html` with the
save in the URL fragment (`js/savecode.ts`). Import is one path, `importSave`:
schema check, merge onto defaults, verified rollback slot, verified write, prior
bytes restored on failure, page write authority retired until reload. The v1.6
origin move (`js/migrate.ts`) reuses it and never overwrites: a save arriving on
a device with progress is filed as a `moved-*` backup entry. v1.7.1 added the
fresh-install `RESTORE COPIED SAVE` menu action (`src/screens/Menu.svelte`),
which reads the clipboard after a tap and falls back to the paste screen.

Nothing calls `navigator.storage.persist()`. Nothing leaves the device without a
tap, and nothing reaches a server: fragments are not sent, and `wrangler.jsonc`
serves static assets only.

## what ios preserves

Stated only where documented or already proven by this repo.

- A Home Screen web app has its own storage container, separate from Safari.
  Documented by WebKit and proven here by the v1.7.1 relocation work.
- Removing the Home Screen app removes that container. This is the premise of
  #100 and matches WebKit's description; no version-by-version test exists here.
- Safari deletes a site's script-writable storage, `localStorage` included,
  after seven days of Safari use without interaction with the site (WebKit,
  Intelligent Tracking Prevention, 2020). That covers play in a Safari tab. How
  the counter applies to an installed app is unverified.
- Whether iCloud backup, encrypted local backup, Quick Start migration or a
  same-device restore brings a Home Screen app's `localStorage` back is
  unverified. Until a physical phone proves it, assume a device replacement
  loses the save.
- Whether `navigator.storage.persist()` changes eviction on iOS is unverified.

## threats

Assets: the live save, its daily backups, the rollback slot. A save holds level,
emeralds, unlocks, stats and a few dates; no name, contact, device identifier or
location. A leaked save is a lost game, not a privacy incident.

- T1 container lost: the icon is deleted (a child tidying, a parent freeing
  space, a reinstall to fix something), or "clear website data" runs.
- T2 device lost: replaced, broken, reset, handed down.
- T3 eviction: the seven-day rule for Safari-tab play, or storage pressure.
- T4 divergence: one save restored on two devices, both then played.
- T5 corruption or a bad restore. Already covered by the rollback slot, daily
  backups and rescue page; listed so no remote option gets credit for it.
- T6 anything remote: interception, server compromise, the operator reading
  saves, a wrong blob pasted into a device, a lost secret.
- T7 child fit: a child cannot keep a secret, read a URL, or choose between two
  saves, and a parent may not be present when a prompt shows.

Not threats: cheating (the rescue page is a save editor by design) and targeted
attack (a save has no value to anyone but its player).

## options

| | (a) manual export plus a reminder | (b) file or Share Sheet backup | (c) encrypted recovery code on Cloudflare | (d) do nothing |
| --- | --- | --- | --- | --- |
| protects against | T1, T2, T3 when the reminder was acted on | same as (a), one fewer step, a copy in Files or iCloud Drive | T1, T2, T3 while the last upload is recent and the secret survives | T5 only |
| does not protect | whoever dismisses the reminder; a child alone | same; iOS standalone download and share behaviour unverified | a lost secret; play since the last upload; a child alone | T1, T2, T3 |
| data leaving the device | none | the code, to a destination the player picks | ciphertext, size, timestamps and the requesting IP address, to Cloudflare | none |
| machinery to operate | a timestamp and a banner | one `navigator.share` call with a file, download and copy as fallbacks | a Worker, a store (KV or R2), size and rate limits, expiry, a delete route, abuse handling, keys, monitoring, cost | none |
| child fit | needs a parent when the banner shows | one tap, then "Save to Files"; the parent still needs to know where | worst: a secret to keep, and a server holding a child's data | nothing to explain |
| two devices | no merge; an arriving save goes to the backup list as today | same | server keeps the last upload; the client files a download as a `moved-*` backup and asks, never overwriting local | not applicable |
| deletion | delete the file or note; nothing else exists | same | a delete route plus store expiry; edge logs are outside our control, so "gone everywhere" cannot be promised | nothing to delete |

## decision

Recommended: (a) and (b) together, and a physical-phone test before any remote
work. Not (c) now. Not (d).

Every option that beats T1 and T2 needs a copy outside the container, and every
copy needs a parent to know it exists. (c) does not remove that: the secret must
be written down, which is the same act as saving the file. Once a parent is
saving something, a file in Files or iCloud Drive is the copy with the least
machinery and the clearest deletion story. (c) is also the only option that
sends a child's data anywhere; encrypted or not, it puts an IP address and a
timestamp next to a blob on a server we operate, a new obligation for a game
whose ethos line says nothing is shared. The issue's constraints (opt-in,
encrypted, exportable, deletable, never overwriting local) are satisfiable, but
satisfying them is real operating work for a threat the file already covers.
The honest gap in (a) and (b), the unattended child, is a gap in (c) too. And
until a phone proves what iCloud restore keeps, the whole arc may be solving a
problem the platform already solves for T2; that test costs an afternoon.

Concretely: record when the save last left the device; after a threshold of
level clears or days, show a dismissable banner in the existing `SaveWarning`
slot with one tap to share the current code as a file (`navigator.share` where
available, today's download and copy otherwise); make the rescue page accept a
`CR1|` code as well as raw JSON, since its restore box reads only JSON while
Save & Data writes only the code; and say on the install screen that an
installed app keeps its own save. The import path does not change.

(c) stays on record as the fallback if the reminder still leaves people losing
saves: player-held secret, client-side AES-GCM, ciphertext only, server-side
expiry, downloads to the backup list never to the live slot, delete on demand.
It is not scheduled.

## open questions

- What does a real iPhone keep through delete-and-reinstall, iCloud restore and
  Quick Start? One disposable save, one phone, recorded in `PLAYTEST.md` style.
- Do `navigator.share` with a file and the `download` attribute work from a
  standalone Home Screen app on iOS? Both are in-browser assumptions today.
- Does the "last exported" timestamp live in an additive save field, which
  travels with the save, or a separate key, which stays with the container?
- What threshold suits a child who plays daily and a parent who checks weekly,
  and how soon may the banner return after a dismissal?
- Is `navigator.storage.persist()` worth requesting at first install?
