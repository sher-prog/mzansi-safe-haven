# SafeExit

SafeExit is a discreet safety-planning and evidence-capture app for people preparing to leave a dangerous domestic situation. It is disguised as **Mzansi Kitchen**, an ordinary South African recipe app — anyone who opens it, glances at it, or scrolls through it while it's in someone's hand sees nothing but recipes.

A hidden gesture unlocks the real app underneath: an exit-plan checklist, a private incident journal, a document vault, an emergency panic button, and a court-oriented evidence exporter, all encrypted on-device with a PIN only the user knows.

## Why this exists

Leaving an abusive relationship is statistically the most dangerous moment in it. Two things make that moment harder in the South African context this app targets:

- **A device is often monitored.** An abuser with physical access to a phone — which is common in coercive-control situations — will look through installed apps, recent photos, and browser history. A visibly-named "safety" or "domestic violence" app is itself a risk to have installed.
- **Getting a protection order requires evidence.** South Africa's Domestic Violence Act process runs through an affidavit to a magistrate, and that affidavit is far stronger with dated, corroborated documentation — photos of injuries or damage, a timeline of incidents, copies of ID and financial documents — than with memory alone, gathered under pressure, often at the last minute.

SafeExit addresses both: the disguise buys safety of possession, and the evidence-capture pipeline buys strength of case, later, when it matters in front of a magistrate.

### How this complements TEARS, not duplicates it

The [TEARS Foundation](https://tears.co.za) runs a free USSD service (`*134*7355#`) that works on any phone with zero airtime or data — it is, deliberately, the most accessible crisis channel that exists in this market, and SafeExit does not try to replace it. GetHelp surfaces the TEARS number and the national GBV Command Centre line prominently, and the panic button falls back to calling TEARS directly if no trusted contact is configured. What SafeExit adds is what a USSD menu structurally cannot do: **persistent, private, on-device storage** — a checklist that's still there tomorrow, a document vault, a dated incident log, photos with cryptographic integrity — for the person who has a smartphone and time to prepare, not just a moment of crisis.

## How it works

On the surface, this is **Mzansi Kitchen**: browse recipes, view details, add your own. It is a fully working recipe app, not a fake shell — that's what makes the disguise durable under casual inspection.

Tapping the small salt-shaker icon in the recipe header three times opens a "Loyalty Code" screen, styled identically to the recipe app's own visual language. Entering the correct PIN unlocks the safety toolkit; an incorrect PIN just shows "Code not recognised — please check your till slip" and returns to the recipe list. There is no visible difference between "wrong PIN" and "this feature doesn't exist" — nothing about the decoy screen, in either state, hints that a hidden mode exists underneath.

## Security architecture

- **PIN-derived encryption, not a password gate.** The 4–6 digit PIN ("loyalty code") is run through PBKDF2-SHA256 (310,000 iterations) with a random per-device salt to derive an AES-256-GCM key, via the browser's native WebCrypto API — no third-party crypto library. That key encrypts every piece of safety data (notes, vault documents, checklist state, the trusted contact, and every captured photo/audio blob) before it touches storage. The PIN itself is never written anywhere; only a salted verifier derived from the key is stored, used solely to check whether a decryption attempt was correct.
- **The PIN cannot be recovered.** This is a deliberate tradeoff, stated explicitly during setup: any recovery mechanism (a reset link, a security question, a cloud-held backup key) is also a mechanism an abuser with account access could use against the person the app is protecting. Forgetting the PIN means the data is unrecoverable, by design.
- **Decoy-gate rejection is indistinguishable from "no such feature."** A wrong PIN produces no different UI, timing, or state than tapping a decorative recipe-page element — there's nothing for an observer to fingerprint as "this app has a hidden unlock."
- **Handoff-aware auto-exit.** Backgrounding the app — switching tabs, the OS app switcher, the phone auto-locking — or pressing Escape immediately locks safety mode: the derived key is dropped from memory and any further access requires the PIN again. The one deliberate exception is a tracked "handoff" window (opening the camera roll, a microphone permission prompt, or a `tel:`/SMS link) — those necessarily background the page too, and without this exception the app would lock itself out from under a legitimate photo picker or phone call. Handoffs expire on a short timeout and Escape always exits instantly regardless of one being active, so this is a narrow, time-boxed carve-out, not a general loosening of the exit behavior.
- **Local-first, no accounts, no server.** There is no backend. Nothing leaves the device unless the user explicitly exports a backup file themselves. There is no login to compromise and no cloud store an abuser — or anyone else — could subpoena, phish, or guess their way into.
- **Encrypted, fully offline backup/restore.** Losing or having a phone destroyed shouldn't mean losing months of documentation. Export produces a single encrypted file (containing the device salt/verifier plus every note, document, and media blob, encrypted under the session key derived from the user's own re-entered PIN) that can be moved to a USB drive, a trusted friend's device, or cloud storage the user controls, and restored on any other device — restore re-derives the key from the entered PIN and the file's embedded salt, so the file is only ever useful to someone who already knows the PIN.
- **Storage persistence.** The app requests persistent storage from the browser where available, to reduce the chance of the OS silently evicting IndexedDB-stored evidence blobs under storage pressure.

## Evidence-grade capture

Photos and audio captured inside the app (My Notes, Document Vault) are treated as potential court evidence, not just in-app media:

- The **original bytes** the device produced — camera output or an imported gallery file — are hashed with **SHA-256 before any other processing touches them**, then stored unmodified. A separate, compressed thumbnail is generated purely for fast in-app display; it is never what gets hashed or exported.
- Every capture is timestamped from the device clock and tagged with GPS coordinates when location permission is available (never required — capture still succeeds without it).
- Each item is labeled **`captured`** (taken with the device camera inside the app, so the timestamp/location reflect the actual moment) or **`imported`** (pulled in from an existing gallery file, for when there wasn't time to open the app before something happened). Both are hashed and stored identically; only this provenance label differs, and it's carried through to the exported evidence pack so a reader knows which is which.
- The **Evidence Pack export** turns a set of notes into a plain, court-facing PDF: a cover page with date range and an integrity explanation, a chronological incident log, embedded full-resolution photos with their capture metadata, and an appendix listing every file's SHA-256 fingerprint for independent verification.

> **The Evidence Pack PDF itself is generated in English only**, regardless of the app's display language — it's a document aimed at a magistrate's clerk in the South African court system, not at the app's own UI, and introducing translation variance into a court exhibit is a bigger risk than the inconvenience of not localizing it. See the comment above the export function in [`src/lib/exportPack.ts`](src/lib/exportPack.ts).

## Features

### 🍳 Cover app — Mzansi Kitchen
Browse and add South African recipes (Bobotie, Bunny Chow, Koeksisters, and more), fully functional on its own — the disguise has to survive actual use, not just a glance.

### 🛡️ Safety toolkit (hidden, PIN-locked)
- **Exit Plan Checklist** — a categorized checklist (documents, essentials, safety steps) for preparing to leave, with progress persisted locally.
- **Get Help** — the national GBV Command Centre line, SAPS emergency numbers, and the TEARS USSD code, prominent and one tap/dial away.
- **Panic Button** — hold to send an emergency SMS with GPS coordinates to a trusted contact configured by the user; falls back to calling the TEARS helpline directly if no contact is set.
- **My Notes** — a private, dated incident journal, each entry optionally backed by an evidence-grade photo and/or voice note, exportable as a court-facing Evidence Pack PDF.
- **Document Vault** — encrypted on-device storage for scans/photos of ID, financial, medical, and legal documents.
- **Backup & Restore** — export/import a single encrypted file for moving everything to a new device or a safe second location.

### 🌍 Language
A language picker sits in the recipe header, styled as an ordinary recipe-app feature (it reinforces the cover story as much as it serves the actual localization need). English, isiZulu, isiXhosa, and Afrikaans are available across both the recipe and safety UI.

> **Translation status:** the isiZulu, isiXhosa, and Afrikaans locale files ([`src/i18n/locales/`](src/i18n/locales/)) are machine-translated placeholders, each marked in-file with `TODO — verify with a native speaker before launch`. They should not be treated as launch-ready copy — see [Roadmap](#roadmap).

## Tech stack

- **React 18** + **TypeScript** (`strictNullChecks` + `noImplicitAny` enabled)
- **Vite** — dev server and build, with `SafetyApp` code-split via `React.lazy` so the initial bundle contains only the recipe cover
- **Tailwind CSS** — theming via CSS custom properties, so the recipe theme and the safety-toolkit theme share one token system instead of hardcoded colors
- **shadcn/ui** (Radix primitives) — trimmed to only the components actually in use
- **Framer Motion** — page transitions
- **WebCrypto (browser-native)** — PBKDF2 key derivation + AES-GCM encryption; no external crypto library
- **IndexedDB** — encrypted media blob storage (photos/audio), separate from the encrypted `localStorage` metadata store
- **Hand-rolled i18n** (`src/i18n/`) — a small typed React Context, chosen over a full library since the string set is app-defined and fixed
- **Sonner** — toast notifications
- **Vitest** + **React Testing Library** — unit/integration tests

## Getting started

```sh
npm install
npm run dev
```

Other scripts: `npm run build` (production build), `npm run lint`, `npm test` (Vitest, single run), `npm run test:watch`.

### Testing on a phone

The PIN setup/unlock screens use the browser's WebCrypto API (`crypto.subtle`), which browsers only expose in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — HTTPS, or the literal hostname `localhost`. `npm run dev` serves plain HTTP on your LAN IP (e.g. `http://192.168.1.x:8080`), and a LAN IP over HTTP is **not** a secure context, even though `localhost` on the same machine would be. Opening that LAN URL on a phone means `crypto.subtle` is simply missing — the app detects this and shows a "Secure Connection Needed" screen instead of failing silently, but you still won't be able to set up or unlock a PIN that way. Two ways around it:

**Option A — serve HTTPS on your LAN IP:**

```sh
npm run dev:https
```

Vite will print an `https://<your-LAN-IP>:8080` URL. Open that on your phone and accept the self-signed certificate warning (expected — the cert isn't from a trusted CA, but the connection is still encrypted, which is all `crypto.subtle` requires). On Windows, set the env var separately if `VITE_HTTPS=true vite` doesn't work in your shell, e.g. in PowerShell: `$env:VITE_HTTPS="true"; npm run dev`.

**Option B — tunnel `localhost` over USB instead:**

- **Android:** connect via USB with debugging enabled, run `adb reverse tcp:8080 tcp:8080`, then open `http://localhost:8080` in the phone's browser — `localhost` is a secure context even over plain HTTP.
- **iOS:** use Xcode's "Point-to-Point" USB tunnel or a tool like [`ios-webkit-debug-proxy`](https://github.com/google/ios-webkit-debug-proxy) to forward a local port over USB, then open `http://localhost:8080` in Safari on the phone.

## Project structure

```
src/
├── components/
│   ├── RecipeCover.tsx         # Cover app: recipe browser + hidden unlock gesture
│   ├── LoyaltyGate.tsx         # PIN setup / unlock screen, styled as the recipe app
│   ├── PinKeypad.tsx           # Shared numeric keypad UI
│   ├── SafetyApp.tsx           # Safety toolkit shell, tab navigation, quick-exit handling
│   ├── ExitPlanChecklist.tsx   # Exit preparation checklist
│   ├── GetHelp.tsx             # National helpline directory (GBV, SAPS, TEARS USSD)
│   ├── PanicButton.tsx         # Emergency SOS + trusted contact setup
│   ├── SafetyNotes.tsx         # Private incident journal (photo/audio capture)
│   ├── Vault.tsx               # Document vault
│   ├── BackupRestore.tsx       # Encrypted backup export/import
│   ├── ImportBackup.tsx        # Restore flow, reachable from the cover screen too
│   ├── Onboarding.tsx          # First-run walkthrough & PIN setup
│   ├── LanguagePicker.tsx      # Language switcher (in the recipe header)
│   └── ErrorBoundary.tsx       # Neutral, recipe-themed crash fallback
├── i18n/
│   ├── index.tsx                # LanguageProvider + useTranslation()
│   └── locales/                 # en.ts (canonical) + af/zu/xh.ts (machine-translated)
├── data/
│   ├── recipes.ts               # Recipe data
│   └── shelters.ts              # National GBV/SAPS/TEARS helpline directory
├── lib/
│   ├── crypto.ts                 # PBKDF2 + AES-GCM helpers (WebCrypto only)
│   ├── secureStorage.ts          # PIN-gated encrypted localStorage wrapper
│   ├── evidence.ts               # Evidence-grade capture: hashing, provenance, GPS
│   ├── exportPack.ts             # Evidence Pack PDF generation (dynamically imported)
│   ├── backup.ts                 # Encrypted offline backup/restore
│   ├── blobStore.ts              # Encrypted media blob storage (IndexedDB)
│   ├── appFocus.ts               # Handoff tracking for the auto-exit exception
│   └── mediaHelpers.ts           # Image compression for display thumbnails
└── pages/Index.tsx               # App entry point & mode switching
```

## Screenshots

_Placeholder — add screenshots here before publishing: the recipe cover, the hidden unlock gesture, the PIN keypad, and the safety toolkit tabs (checklist, Get Help, panic button, notes, vault, backup)._

## Roadmap

- **Video evidence** — extend the capture pipeline (hash-before-processing, provenance labeling) to short video clips.
- **Verified shelter directory** — replace the bundled static helpline list with a maintained, location-aware directory.
- **Native-speaker translation review** — the isiZulu, isiXhosa, and Afrikaans locale files are machine-translated placeholders and need review by fluent speakers before this app is used by anyone who isn't testing it.
- **Independent security audit** — the encryption design here has not been externally reviewed; that should happen before this is relied on in a genuinely high-risk situation.
- **POPIA review** — a formal review against South Africa's Protection of Personal Information Act, even though the app is local-first and stores nothing on a server, to make sure the backup/export flow and any future shelter-directory data handling hold up.
- **Recipe editing/deletion** — the cover app currently supports adding recipes but not editing or removing them.

## A note on use

This project is intended for humanitarian use. If you or someone you know is in immediate danger in South Africa, contact the SAPS on **10111**, the GBV Command Centre on **0800 150 150**, or dial **`*134*7355#`** (TEARS) from any phone.
