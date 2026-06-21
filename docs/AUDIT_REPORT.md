# Security & Cryptographic Audit Report: RedPen

This document outlines the security invariants, threat model, cryptographic envelopes, and verification strategies for **RedPen**.

---

## 1. Security Invariants

RedPen enforces the following security guarantees:

1. **Client-Side Envelope Encryption**: Sensitive contract texts are split and encrypted locally under **AES-GCM-256** prior to sending them over the host out-of-process RPC layer. The raw plaintext is never stored in persistent host logs.
2. **Key Isolation**: Ephemeral AES keys and the persistent Ed25519 signing seed (`.redpen_key`) reside strictly inside the Executa local environment. They are never exposed to the iframe frontend or transmitted over external network requests.
3. **Cryptographic Human-in-the-Loop Signatures**: All reviewed changes are signed using **Ed25519** over the concatenated hash of the finalized document and the executive summary memo. This signature acts as a tamper-proof audit trail proving user consent to terms.

---

## 2. Threat Model Analysis

### Threat T1: Host-Mediated Legal Data Interception
- **Description**: A malicious node running the Anna Host intercepts raw contract payloads in RPC logs.
- **Mitigation**: RedPen encrypts each clause payload using AES-GCM-256 before transport. The Host only receives ciphertext envelopes, preventing plaintext data harvesting at the hosting layer.

### Threat T2: Legal Gaslighting & Post-Export Modification
- **Description**: A counterparty or hosting service modifies a redlined clause after review and claims the user approved it.
- **Mitigation**: The finalized report contains an Ed25519 signature of the combined contract and memo hash. Any alteration to the contract text, memo contents, or metadata will invalidate the signature check.

### Threat T3: Side-Channel Private Key Exfiltration
- **Description**: Cross-site scripting (XSS) or iframe injection attempts to read the user's signing key.
- **Mitigation**: The private key is never shared with the iframe. The iframe only receives the public key for metadata displays. All signing operations occur inside the isolated Python subprocess.

---

## 3. Cryptographic Specifications

- **Symmetric Cipher**: AES-256-GCM (12-byte random IV, 16-byte authentication tag).
- **Asymmetric Signature**: Ed25519 (RFC 8032 compliant).
- **Integrity Hashing**: SHA-256 for clause tracking and SHA-512 for Ed25519 parameters.
