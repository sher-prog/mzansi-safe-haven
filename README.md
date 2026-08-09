# SafeExit

A discreet safety planning app disguised as a South African recipe collection. Designed to help individuals in dangerous domestic situations plan a safe exit — without raising suspicion.

## How It Works

On the surface, SafeExit looks like **Mzansi Kitchen**, a recipe browsing app. A hidden gesture (tapping the small salt shaker icon in the recipe header 3 times) opens a "Loyalty Code" screen, styled exactly like the recipe app. Entering the correct PIN unlocks the real safety toolkit underneath; an incorrect PIN just shows a generic "code not recognised" message and returns to the recipe list — nothing about the screen hints that a hidden mode exists.

## Features

### 🍳 Cover App — Mzansi Kitchen
- Browse South African recipes (Bobotie, Bunny Chow, Koeksisters, etc.)
- Add custom recipes, saved locally on-device
- Fully functional recipe viewer to maintain the disguise

### 🛡️ Safety Toolkit (hidden, PIN-locked)
- **Exit Plan Checklist** — Step-by-step checklist for preparing a safe exit (documents, essentials, safety steps)
- **Shelter Map** — National GBV helplines and emergency numbers
- **Panic Button** — Hold to send an emergency SMS with GPS coordinates to a trusted contact you configure yourself; falls back to the TEARS helpline if no contact is set
- **My Notes** — Private journaling space for documenting incidents
- **Document Vault** — Store photos/scans of important documents (ID, financial, medical, legal) locally on-device

### 🔐 Privacy & Security
- **PIN-locked and encrypted at rest** — On first use, you choose a 4–6 digit PIN ("loyalty code"). All safety data (notes, vault documents, checklist) is encrypted with a key derived from that PIN (PBKDF2 + AES-GCM, via the browser's WebCrypto API) before it ever touches `localStorage`. The PIN itself is never stored — only a salted verifier hash used to check it.
- **The PIN cannot be recovered.** If you forget it, your private entries cannot be decrypted. This is stated explicitly during PIN setup.
- **No cloud sync, no accounts.** This is a local-first app: nothing leaves the device. There is no backend, no login, and no way for anyone else to retrieve your data by guessing a code — a real risk with the recovery-code-based cloud backup this app used in earlier versions, which has been removed entirely.
- **Quick Exit, hardened** — Tap "Quick Exit", press Escape, or simply switch away from the tab/app (e.g. the OS app switcher) and safety mode instantly closes, returning to the recipe cover and dropping the decryption key from memory so re-entry always requires the PIN again.
- **Onboarding** — First-time walkthrough explaining the app's true purpose and PIN setup.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — Fast dev server and build
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Accessible component primitives
- **Framer Motion** — Smooth page transitions and animations
- **WebCrypto (browser-native)** — PBKDF2 key derivation + AES-GCM encryption for on-device data; no external crypto library
- **Sonner** — Toast notifications

## Getting Started

```sh
npm install
npm run dev
```

### Testing on a phone

The PIN setup/unlock screens use the browser's WebCrypto API (`crypto.subtle`),
which browsers only expose in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) —
HTTPS, or the literal hostname `localhost`. `npm run dev` serves plain HTTP on your
LAN IP (e.g. `http://192.168.1.x:8080`), and a LAN IP over HTTP is **not** a secure
context, even though `localhost` on the same machine would be. Opening that LAN URL
on a phone means `crypto.subtle` is simply missing — the app detects this and shows
a "Secure Connection Needed" screen instead of failing silently, but you still won't
be able to actually set up or unlock a PIN that way. Two ways around it:

**Option A — serve HTTPS on your LAN IP:**

```sh
npm run dev:https
```

Vite will print an `https://<your-LAN-IP>:8080` URL. Open that on your phone and
accept the self-signed certificate warning (it's expected — the cert isn't from a
trusted CA, but the connection is still encrypted, which is all `crypto.subtle`
requires). On Windows, set the env var separately if `VITE_HTTPS=true vite` doesn't
work in your shell, e.g. in PowerShell: `$env:VITE_HTTPS="true"; npm run dev`.

**Option B — tunnel `localhost` over USB instead:**

- **Android:** connect via USB with debugging enabled, run `adb reverse tcp:8080 tcp:8080`,
  then open `http://localhost:8080` in the phone's browser — `localhost` is a secure
  context even over plain HTTP.
- **iOS:** use Xcode's "Point-to-Point" USB tunnel or a tool like
  [`ios-webkit-debug-proxy`](https://github.com/google/ios-webkit-debug-proxy) to forward
  a local port over USB, then open `http://localhost:8080` in Safari on the phone.

## Project Structure

```
src/
├── components/
│   ├── RecipeCover.tsx        # Cover app (recipe browser + hidden gesture)
│   ├── LoyaltyGate.tsx         # PIN setup / unlock screen, styled as the recipe app
│   ├── PinKeypad.tsx           # Shared numeric keypad UI
│   ├── SafetyApp.tsx           # Safety toolkit shell & tab navigation
│   ├── ExitPlanChecklist.tsx   # Exit preparation checklist
│   ├── ShelterMap.tsx          # National helpline directory
│   ├── PanicButton.tsx         # Emergency SOS button + trusted contact setup
│   ├── SafetyNotes.tsx         # Private notes
│   ├── Vault.tsx               # Document vault
│   ├── Onboarding.tsx          # First-run walkthrough & PIN setup
│   └── ErrorBoundary.tsx       # Neutral, recipe-themed crash fallback
├── data/
│   ├── recipes.ts              # Recipe data
│   └── shelters.ts             # National GBV helpline directory
├── lib/
│   ├── crypto.ts                # PBKDF2 + AES-GCM helpers (WebCrypto only)
│   ├── secureStorage.ts         # PIN-gated encrypted localStorage wrapper + legacy-data migration
│   └── mediaHelpers.ts          # Image compression utilities
└── pages/Index.tsx              # App entry point & mode switching
```

## License

This project is intended for humanitarian use. If you or someone you know is in danger, please reach out to local support services.
