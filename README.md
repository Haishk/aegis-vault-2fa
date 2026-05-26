# Aegis Vault 2FA 

> A zero-knowledge, decentralized "Dead Man's Switch" designed for the secure storage and autonomous dispersal of digital wills and sensitive assets.

---

##  The Problem
Centralized password managers represent a significant single point of failure. If an individual passes away or loses access, passing on encrypted digital assets (legal Wills, crypto wallets) securely currently requires immense trust in a singular entity or an automated script that is vulnerable to exploitation.

##  The Zero-Knowledge Solution
The **Aegis Protocol** provides a completely decentralized, zero-knowledge architecture built on modern cryptographic practices. It ensures that **no single point of failure**—neither the server, developers, nor any individual trustee—can compromise the stored assets.

##  Core Innovations

### 1. Shamir's Secret Sharing (Threshold Cryptography)
The master decryption key is fractured into **N** fragments (shards) directly in the browser. A mathematical threshold **K** restricts reconstruction; for instance, if K=3, even a compromised database with 2 shards provides zero information about the master key.

### 2. Out-of-Band 2FA Execution
To protect against database breaches, the browser generates unique 6-digit security PINs locally. Each Shamir shard is **double-encrypted** via AES using these PINs before being uploaded. Users distribute these PINs to heirs via physical or out-of-band channels, keeping the database perfectly "blind."

### 3. Biometric Proof-of-Life Heartbeats
Distribution of shards is delayed by a persistent heartbeat requirement. The protocol utilizes OS-level webcam access for **facial geometry authentication** every 30 days to prove the user is active.

### 4. Automated SMTP Triggers
Upon detecting a heartbeat failure, the SQL server automatically triggers **Nodemailer SMTP** scripts to dispatch the encrypted shards and ciphertext directly to the designated trustees' email addresses.

---

## 🛠️ Tech Stack

- **Frontend**: React.js, Vite, Framer Motion, Lucide-React
- **Cryptography Engine**: 
  - `crypto-js`: AES-256 wrapping
  - `secrets.js-grempe`: Shamir’s Polynomial Matrix operations
  - `react-webcam`: Biometric MFA mapping
- **Backend**: Express.js REST API
- **Database**: SQLite3 (Immutable Audit Ledger)
- **Networking**: Nodemailer / Ethereal SMTP transmission

---

##  Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/Haishk/aegis-vault-2fa.git
cd aegis-vault-2fa
```

### 2. Install Dependencies
```bash
# Install root (if needed), frontend, and backend deps
cd frontend && npm install
cd ../backend && npm install
```

### 3. Start Development Environment
```bash
# Terminal 1: Backend
cd backend && node server.js

# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## ⚖️ License
This project is for educational and portfolio purposes. 
Designed for Critical Impact.
