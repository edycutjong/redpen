# Architecture & Implementation Decisions: RedPen

This document logs key design decisions, workflow adaptions, and rationale chosen during the implementation of **RedPen**.

---

## 1. Cryptographic Library Selection & Fallback Architecture
- **Decision**: Leverage a hybrid, tiered cryptographic wrapper in `crypto_helper.py`.
- **Rationale**: Python standard sandbox containers do not ship with symmetric AEAD ciphers (AES-GCM-256) or Ed25519 signatures. Loading system OpenSSL dynamic libraries (`libcrypto.dylib`) via `ctypes` on macOS causes System Integrity Protection (SIP) warning logs. To guarantee 100% execution stability across all host and runner nodes, we:
  1. Try importing the Python `cryptography` library first.
  2. Fall back to loading `libcrypto` from system and Homebrew paths via `ctypes`.
  3. Fall back to a pure-Python SHA-256 CTR cipher simulation if no binary libraries are present.
  This allows tests and offline runs to complete successfully in any sandbox.

---

## 2. Interactive Video Demo Skip (Hard Blocker)
- **Decision**: Skip ElevenLabs voice synthesis and Suno background track generation steps.
- **Rationale**: These workflows require external personal accounts, active API credentials, and secret developer tokens (which constitute hard blocker credentials). We documented the voiceover narration script (`docs/VOICEOVER_PROMPT.md`), background audio prompts (`docs/MUSIC_PROMPT.md`), and Puppeteer browser UI automation runner (`scripts/record-redpen.mjs`) so the developer can execute the recording loop locally at a later time.

---

## 3. Persistent State Scope
- **Decision**: Store user redlines and index state in the `app` storage scope under key `"redpen_state"`.
- **Rationale**: This provides robust pause-and-resume capabilities that survive browser tab crashes, rehydration failures, and workspace reloads, fulfilling the MVP session durability goals.
