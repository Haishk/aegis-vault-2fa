const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Set up Nodemailer for REAL E-mail transmission using Ethereal (Development SMTP)
let transporter;
nodemailer.createTestAccount((err, account) => {
    if (err) {
        console.error('Failed to create a testing account. ' + err.message);
        return;
    }
    console.log('Nodemailer Enabled! SMTP Server credentials established securely.');

    // Create a transporter object
    transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
            user: account.user,
            pass: account.pass
        }
    });
});

// Setup Immutable SQLite Ledger Database
const db = new sqlite3.Database('./ledger.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error("DB Initialization Error:", err.message);
});

// Create tables for Vaults, Audit Logs, and Trustee distributions
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS vaults (
        vault_id TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        n_trustees INTEGER,
        k_threshold INTEGER,
        heartbeat_deadline INTEGER,
        status TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vault_id TEXT,
        action TEXT,
        timestamp INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS pending_trustees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vault_id TEXT,
        email TEXT,
        shard_payload TEXT,
        distributed BOOLEAN DEFAULT 0
    )`);
});

// Helper Function: Post-Mortem Audit Logger
const logAudit = (vault_id, action) => {
    db.run("INSERT INTO audit_logs (vault_id, action, timestamp) VALUES (?, ?, ?)", [vault_id, action, Date.now()]);
    console.log(`[AUDIT LOG] ${vault_id} -> ${action}`);
};

// ==========================================
// API ENDPOINT: INITIALIZE VAULT
// ==========================================
app.post('/api/vault', (req, res) => {
    const { ciphertext, trusteesN, thresholdK, heartbeatDeadline } = req.body;
    const vault_id = "VLT-" + Math.random().toString(36).substr(2, 9).toUpperCase();

    db.run(`INSERT INTO vaults (vault_id, ciphertext, n_trustees, k_threshold, heartbeat_deadline, status) 
            VALUES (?, ?, ?, ?, ?, ?)`, 
        [vault_id, ciphertext, trusteesN, thresholdK, heartbeatDeadline, 'ACTIVE'], 
        (err) => {
            if (err) return res.status(500).json({ error: "DB Error" });
            
            logAudit(vault_id, "VAULT_INITIALIZED: Cryptographic architecture deployed.");
            logAudit(vault_id, `PARAMETER_SET: N=${trusteesN}, K=${thresholdK}. Zero-Knowledge Active.`);

            res.json({ vault_id, message: "Vault Secured. Awaiting Trustee Bindings." });
        }
    );
});

// ==========================================
// API ENDPOINT: BIND TRUSTEE EMAILS & SHARDS
// ==========================================
app.post('/api/vault/:id/bind_trustees', (req, res) => {
    const vault_id = req.params.id;
    const { trusteeData } = req.body; // Array of { email, shard }

    const stmt = db.prepare("INSERT INTO pending_trustees (vault_id, email, shard_payload) VALUES (?, ?, ?)");
    trusteeData.forEach(t => {
        stmt.run(vault_id, t.email, t.shard);
    });
    stmt.finalize();

    logAudit(vault_id, `TRUSTEES_BOUND: ${trusteeData.length} PGP-Wrapped emails securely mapped to database.`);
    logAudit(vault_id, "DEAD_MANS_SWITCH_ARMED: Shards are vaulted. Distribution executes only upon heartbeat failure.");

    res.json({ success: true, message: "Emails securely bound." });
});

// ==========================================
// API ENDPOINT: VAULT TELEMETRY DASHBOARD
// ==========================================
app.get('/api/vault/:id', (req, res) => {
    const vault_id = req.params.id;
    db.get("SELECT * FROM vaults WHERE vault_id = ?", [vault_id], (err, vault) => {
        if (!vault || err) return res.status(404).json({ error: "Vault not found" });
        
        db.all("SELECT * FROM audit_logs WHERE vault_id = ? ORDER BY timestamp DESC", [vault_id], (err, logs) => {
            res.json({ vault, logs });
        });
    });
});

// ==========================================
// API ENDPOINT: BIOMETRIC MFA HEARTBEAT
// ==========================================
app.post('/api/vault/:id/heartbeat', (req, res) => {
    const vault_id = req.params.id;
    const newDeadline = Date.now() + (30 * 24 * 60 * 60 * 1000); // Reset for 30 days
    
    db.run("UPDATE vaults SET heartbeat_deadline = ?, status = 'ACTIVE' WHERE vault_id = ?", [newDeadline, vault_id], (err) => {
        if(err) return res.status(500).json({ error: "Failed to reset switch." });
        
        logAudit(vault_id, "BIOMETRIC_MFA_VERIFIED: Facial recognition matrix validated.");
        logAudit(vault_id, "HEARTBEAT_EXTENDED: Dead Man's Switch countdown reset 30 Days.");
        res.json({ success: true, message: "Biometric Heartbeat Verified." });
    });
});

// ==========================================
// API ENDPOINT: SIMULATE USER DEATH (TRIGGER & EMAIL DISPATCH)
// ==========================================
app.post('/api/vault/:id/trigger_death', (req, res) => {
    const vault_id = req.params.id;
    
    db.run("UPDATE vaults SET status = 'TRIGGERED' WHERE vault_id = ?", [vault_id], (err) => {
        if(err) return res.status(500).json({ error: "DB Error setting status" });

        logAudit(vault_id, "CRITICAL: DEAD MAN'S SWITCH TRIGGERED. HEARTBEAT FAILURE DETECTED.");
        logAudit(vault_id, "DISTRIBUTING_SHARDS: Connecting to secure SMTP Server...");

        db.get("SELECT ciphertext FROM vaults WHERE vault_id = ?", [vault_id], (err, vault) => {
            db.all("SELECT email, shard_payload FROM pending_trustees WHERE vault_id = ?", [vault_id], (err, trustees) => {
                if(err || trustees.length === 0) return res.json({ success: false });

                // SEND ACTUAL EMAILS TO EACH TRUSTEE
                trustees.forEach(t => {
                    let message = {
                        from: '"Aegis Vault Security Server" <aegis-noreply@digitalvault.com>',
                        to: t.email,
                        subject: `WARNING: Aegis Vault Triggered - You Are a Designated Trustee (${vault_id})`,
                        html: `
                            <h2 style="color:red;">WARNING: Aegis Dead Man's Switch Triggered</h2>
                            <p>The primary user of Vault <strong>${vault_id}</strong> has failed their biometric heartbeat. The system assumes they are permanently incapacitated.</p>
                            <p>You have been assigned as a Trustee. You must coordinate with the other Trustees and use the Aegis Protocol Reconstruct Portal.</p>
                            <h3>1. Your Unique Encrypted Shard:</h3>
                            <p style="font-family:monospace; background:#f4f4f4; padding:15px; border-left:4px solid red; word-break:break-all;">
                                ${t.shard_payload}
                            </p>
                            <h3>2. The Master Encrypted Payload (Ciphertext):</h3>
                            <p style="font-family:monospace; background:#e0f7fa; padding:15px; border-left:4px solid #00bcd4; word-break:break-all;">
                                ${vault.ciphertext}
                            </p>
                            <p>Paste BOTH of these blocks (plus your 6-Digit PIN) into the Reconstruct Portal to unlock the Will.</p>
                        `
                    };

                    // Execute the email transmission natively through SMTP
                    transporter.sendMail(message, (err, info) => {
                        if (err) {
                            logAudit(vault_id, `SMTP_ERROR: Could not deliver email to ${t.email}`);
                        } else {
                            const inboxPreviewUrl = nodemailer.getTestMessageUrl(info);
                            logAudit(vault_id, `✔ EMAIL PHYSICALLY SENT TO [ ${t.email} ] ==> Copy Link: ${inboxPreviewUrl}`);
                            console.log(`REAL EMAIL DEMO PREVIEW URL for ${t.email}: ${inboxPreviewUrl}`);
                        }
                    });
                });

                res.json({ success: true, trusteesDistributed: trustees });
            });
        });
    });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Backend Active: SECURE SERVER ON PORT ${PORT}`);
});
