AEGIS DIGITAL VAULT & PROTOCOL - PROJECT README
===============================================

1. THE PROBLEM
Centralized password managers are an enormous single point of failure. If an individual passes away or loses memory, passing on encrypted digital assets (legal Wills, crypto wallets) securely requires immense trust in a singular lawyer or automated server script that could easily be hacked.

2. THE ZERO-KNOWLEDGE SOLUTION
The Aegis Protocol provides a completely decentralized, zero-knowledge "Dead Man's Switch" built atop Web3 cryptography practices. It structurally enforces that NO single point of failure can compromise the asset—neither the server, developers, nor any individual trustee.

3. CORE INNOVATIONS
- Shamir's Secret Sharing (Threshold Cryptography): The Browser fractures the master decrypting key into 'N' fragments. A mathematical threshold 'K' natively restricts reconstruction. If K is 3, no combination of 2 shards can guess any fraction of the key.
- Out-of-Band 2FA Execution: To prevent a Database breach from stealing the raw shards, the Browser locally generates a 6-Digit PIN, double-encrypting the Shamir Shard before sending it to the server. The user physically texts these PINs to their heirs. The database remains perfectly 'Blind'.
- Post-Mortem Biometric APIs: To delay the distribution of the shards, the user must prove they are alive. We avoid simple, hackable passwords by activating OS-level Optical Webcams to authenticate facial geometry every 30 days.
- Nodemailer SMTP Triggers: The moment the 30-Day SQL server detects 'Heartbeat Failure', it permanently connects directly to SMTP servers and physically dispatches real HTML emails containing the AES-Ciphertext and AES-Shards to the Trustees.

4. THE MODERN TECH STACK
- Client Level: React JS, Vite, Framer Motion (for UI interaction modeling)
- Encryption Engine: crypto-js (for AES wrappers), secrets.js-grempe (for Polynomial matrix solving), react-webcam (for Biometric MFA mapping).
- Server / Routing Node: Express.js REST API.
- Storage & Triggers: SQLite3 Immutable Audit Ledger.
- Networking layer: Nodemailer / Ethereal SMTP transmission.
