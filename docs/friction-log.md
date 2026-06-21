# Developer Friction Log: RedPen on Anna App Platform

This log documents developer experience feedback, platform capabilities, and implementation challenges encountered while building **RedPen** on the Anna App Native Runtime.

---

## 1. What Worked Extremely Well

- **Multi-View Window Routing**: The `window.open_view()` and `window.close()` primitives worked flawlessly. Being able to segment the workspace between the main Dashboard and a dedicated `clause_review` Desk kept the UX clean and uncluttered.
- **Unified SDK Wrapper**: The postMessage RPC interface to the host (`tools.invoke`, `storage.set/get`) is lightweight and easy to wrap into a standard JavaScript class.
- **Zero API Key Management**: The host-routed LLM dispatcher (`sampling/createMessage`) saved significant development overhead. Not needing to provision or secure OpenAI/Anthropic API keys inside a client-side plugin is a massive benefit for AI-native extensions.

---

## 2. Friction Points & Engineering Workarounds

### A. Bidirectional Stdio JSON-RPC Multiplexing
- **Friction**: Python Executas communicate with the host over `stdin` and `stdout`. When an Executa needs to make a reverse-RPC call to the host (e.g., calling `sampling/createMessage` from the plugin backend), it must send a request and wait for a response *on the same I/O stream* where it handles incoming requests from the host.
- **Workaround**: We designed a multithreaded reader-writer lock pattern. The reader loop parses stdout lines in a daemon thread. If it's a response to an outstanding request, it notifies the waiting thread via a `threading.Event`. If it's an incoming host request, it spawns a worker thread to handle it. A built-in multiplexer is highly recommended in future Anna SDK releases.

### B. Lack of Native Cryptographic Modules in Python Standard Library
- **Friction**: Implementing secure local envelope encryption (AES-GCM-256) and report signing (Ed25519) is an enterprise requirement for contract privacy. However, Python's standard library has no built-in symmetric cipher or Ed25519 modules. Loading OpenSSL `libcrypto` via `ctypes` on macOS triggers System Integrity Protection (SIP) warning logs.
- **Workaround**: We engineered a tiered cryptographic library that tries standard `cryptography` first, falls back to raw OpenSSL via `ctypes` (correctly locating Homebrew paths), and implements a pure-Python SHA-256 CTR cipher fallback. Future Anna containers should pre-install common security bindings.

### C. CORS Gating on Standalone Previews
- **Friction**: Local static templates (e.g., `sanity-check.html`) attempting to load sibling files in iframes are blocked by browser CORS policies when opened via `file://`.
- **Workaround**: We included an `npx serve .` preview script to bind a local localhost server for testing.

---

## 3. Recommended Platform Enhancements

1. **Pre-baked Cryptographic Utilities**: Provide built-in primitives for local encryption (AES-GCM) and identity signing (Ed25519) within the Executa environment to eliminate custom wrapper code.
2. **Reverse RPC Helpers**: Include standard helper classes in the Python SDK for sending sync/async requests to the host over JSON-RPC.
3. **Structured Storage Queries**: Extend `storage.list/get` to support querying by tags or simple indexes to make session management easier as app sizes scale.
