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
