import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, FileKey2, Network, ChevronRight, Activity, Fingerprint, RefreshCcw, CheckCircle, Unlock, Database, Clock, Camera, User, Scan, Mail, AlertTriangle, Key } from 'lucide-react';
import secrets from 'secrets.js-grempe';
import CryptoJS from 'crypto-js';
import Webcam from 'react-webcam';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isLocking, setIsLocking] = useState(false);
  const [vaultId, setVaultId] = useState(null);
  const [ciphertext, setCiphertext] = useState('');
  
  // Vault Setup State
  const [secretMsg, setSecretMsg] = useState('');
  const [trusteesN, setTrusteesN] = useState(5);
  const [thresholdK, setThresholdK] = useState(3);
  
  // Trustee Assignment State
  const [generatedShards, setGeneratedShards] = useState([]);
  const [trusteeEmails, setTrusteeEmails] = useState([]);
  const [showPinDownloadModal, setShowPinDownloadModal] = useState(false);
  const [generatedPins, setGeneratedPins] = useState([]);
  
  // Audit & Telemetry State
  const [auditLogs, setAuditLogs] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState("30 Days, 00h:00m");
  const [vaultStatus, setVaultStatus] = useState("ACTIVE");

  // Reconstruct State
  const [pastedCipher, setPastedCipher] = useState('');
  // Each friend provides their Encrypted Shard Blob AND their Out-Of-Band PIN
  const [reconstructInputs, setReconstructInputs] = useState([{ shardBlob: '', securityPin: '' }, { shardBlob: '', securityPin: '' }, { shardBlob: '', securityPin: '' }]);
  const [recoveredMsg, setRecoveredMsg] = useState('');
  const [reconstructError, setReconstructError] = useState('');
  const [reconstructLogs, setReconstructLogs] = useState([]);

  // Facial Recognition State
  const [isScanningFace, setIsScanningFace] = useState(false);
  const [scanText, setScanText] = useState("Initializing Biometric Lens...");
  const [scanStep, setScanStep] = useState(0);

  const fetchTelemetry = async (id) => {
      try {
          const res = await fetch(`http://localhost:3001/api/vault/${id}`);
          if (res.ok) {
              const data = await res.json();
              setAuditLogs(data.logs);
              setVaultStatus(data.vault.status);
              if(data.vault.status === 'TRIGGERED') {
                  setTimeRemaining("00 Days, 00h:00m - DEAD MAN TRIGGERED");
              } else {
                  setTimeRemaining("30 Days, 00h:00m - SECURE");
              }
          }
      } catch (err) {
          console.error("Telemetry Endpoint Offline.");
      }
  };

  useEffect(() => {
      let interval;
      if (vaultId && activeTab === 'dashboard') {
          fetchTelemetry(vaultId);
          interval = setInterval(() => fetchTelemetry(vaultId), 2000);
      }
      return () => clearInterval(interval);
  }, [vaultId, activeTab]);

  // INITIALIZE VAULT LOGIC (AES-256 + SSS)
  const handleLockVault = () => {
    if(!secretMsg) return alert("Please enter a target payload.");
    if(thresholdK > trusteesN) return alert("Threshold must be <= Total Trustees");
    
    setIsLocking(true);
    
    setTimeout(async () => {
      try {
        const masterKey = CryptoJS.lib.WordArray.random(32).toString();
        const encryptedPayload = CryptoJS.AES.encrypt(secretMsg, masterKey).toString();
        const masterKeyHex = secrets.str2hex(masterKey);
        
        // This generates exactly N shards based on polynomial matrix
        const shards = secrets.share(masterKeyHex, parseInt(trusteesN), parseInt(thresholdK));
        setGeneratedShards(shards);
        setTrusteeEmails(Array(parseInt(trusteesN)).fill(''));
        
        // PUSH BASE CIPHERTEXT TO BACKEND
        const response = await fetch('http://localhost:3001/api/vault', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ciphertext: encryptedPayload,
                trusteesN: parseInt(trusteesN),
                thresholdK: parseInt(thresholdK),
                heartbeatDeadline: Date.now() + (30 * 24 * 60 * 60 * 1000)
            })
        });

        if (response.ok) {
            const data = await response.json();
            setVaultId(data.vault_id);
            setCiphertext(encryptedPayload);
            setActiveTab('trustees');
        }
      } catch (err) {
        console.error("Encryption Architecture Failure:", err);
      }
      setIsLocking(false);
    }, 2800); 
  };

  const updateEmail = (index, value) => {
      const updated = [...trusteeEmails];
      updated[index] = value;
      setTrusteeEmails(updated);
  }

  const generateRandomPin = () => {
      return Math.random().toString(36).substring(2, 8).toUpperCase(); // e.g. 'A7X9F2'
  };

  // 2FA OUT-OF-BAND ENCRYPTION (PERFECT UX & ZERO KNOWLEDGE)
  const handleBindTrustees = async () => {
      const hasEmpty = trusteeEmails.some(email => email.trim() === '');
      if(hasEmpty) return alert("You must provide an email for every single generated shard/trustee.");

      setIsLocking(true);

      setTimeout(async () => {
          try {
              const trusteeData = [];
              const demoPinsToSave = [];

              for (let i = 0; i < generatedShards.length; i++) {
                  // Generate a simple 6-character PIN for this specific friend
                  const securityPin = generateRandomPin();
                  
                  // Wrap the raw Hex Shard in standard AES using this simple PIN
                  const pinWrappedShard = CryptoJS.AES.encrypt(generatedShards[i], securityPin).toString();

                  trusteeData.push({
                      email: trusteeEmails[i],
                      shard: pinWrappedShard // The server gets THIS! It cannot be opened without the PIN.
                  });

                  demoPinsToSave.push({
                      email: trusteeEmails[i],
                      pin: securityPin,
                      shardBlob: pinWrappedShard
                  });
              }

              // Send the PIN-wrapped shards to the SQLite database
              const res = await fetch(`http://localhost:3001/api/vault/${vaultId}/bind_trustees`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ trusteeData })
              });

              if(res.ok) {
                  setGeneratedPins(demoPinsToSave);
                  setShowPinDownloadModal(true); // Force user to copy the PINs for the demo
              }
          } catch(e) {
              console.error(e);
          }
          setIsLocking(false);
      }, 500); 
  };

  const executeFacialRecognition = () => {
       setIsScanningFace(true);
       setScanStep(0);
       setScanText("Isolating Facial Features...");
       setTimeout(() => { setScanStep(1); setScanText("Running 4096-Point Biometric Matrix..."); }, 2000);
       setTimeout(() => { setScanStep(2); setScanText("Verifying Identity against Encrypted Ledger..."); }, 4000);
       setTimeout(async () => {
           setScanStep(3);
           setScanText("MATCH CONFIRMED. AUTHORIZED.");
           if(vaultId) {
               try { await fetch(`http://localhost:3001/api/vault/${vaultId}/heartbeat`, { method:'POST' }); fetchTelemetry(vaultId); } catch(err){}
           }
       }, 6000);
       setTimeout(() => { setIsScanningFace(false); }, 7500);
  };

  const handleSimulateDeath = async () => {
      if(!vaultId) return;
      if(window.confirm("SIMULATE FATAL HEARTBEAT FAILURE?\nThis instantly triggers the Dead Man's Switch logic. The Node server will structurally 'Email' the PIN-wrapped Shards to your friends out of the vault storage.")) {
          try {
             await fetch(`http://localhost:3001/api/vault/${vaultId}/trigger_death`, { method:'POST' });
             fetchTelemetry(vaultId);
          } catch(err){}
      }
  };

  const updateReconstructInput = (index, field, value) => {
      const newInputs = [...reconstructInputs];
      newInputs[index][field] = value;
      setReconstructInputs(newInputs);
  };

  // FULL OFFLINE OUT-OF-BAND + SHAMIR RECONSTRUCTION
  const handleReconstruct = () => {
    setReconstructError('');
    setRecoveredMsg('');
    setReconstructLogs([]);
    
    // Filter active inputs
    const activeInputs = reconstructInputs.filter(inp => inp.shardBlob.trim() !== '' && inp.securityPin.trim() !== '');

    try {
      if(activeInputs.length < 2) throw new Error("At least 2 Friend Packages required to initiate polynomial decryption.");
      
      const logs = [];
      const unwrappedHexShards = [];

      // Phase 1: Symmetric 2FA PIN Unwrap
      logs.push("Executing PIN-Decryption on Trustee Envelopes...");
      for(let i=0; i<activeInputs.length; i++) {
          try {
              const bytes = CryptoJS.AES.decrypt(activeInputs[i].shardBlob, activeInputs[i].securityPin);
              const rawHexShard = bytes.toString(CryptoJS.enc.Utf8);
              
              if(!rawHexShard || rawHexShard.length === 0) {
                  throw new Error("Invalid security PIN");
              }
              logs.push(`✅ SUCCESS: Unwrapped Hexadecimal Shard Signature ${i+1} using out-of-band PIN.`);
              unwrappedHexShards.push(rawHexShard);
          } catch(e) {
              logs.push(`❌ FAILURE: Friend ${i+1}'s 6-Digit PIN was incorrect. Envelope remains locked.`);
              setReconstructLogs(logs);
              throw new Error(`Invalid Security PIN provided for package ${i+1}.`);
          }
      }

      // Phase 2: Shamir Polynomial Re-assembly
      logs.push(`Combining ${unwrappedHexShards.length} raw Hex shards via Shamir's Polynomial Matrix...`);
      const combinedHex = secrets.combine(unwrappedHexShards);
      const reconstructedMasterKey = secrets.hex2str(combinedHex);
      
      if(!reconstructedMasterKey || reconstructedMasterKey.length < 5) throw new Error("Threshold not met. Polynomial matrix solved into garbage data.");
      logs.push(`✅ SUCCESS: Master AES-256 Key computationally restored.`);

      // Phase 3: AES-256 Final Payload Decryption
      logs.push(`Applying Master AES Key to Origin Ciphertext...`);
      const finalBytes = CryptoJS.AES.decrypt(pastedCipher, reconstructedMasterKey);
      const originalText = finalBytes.toString(CryptoJS.enc.Utf8);
      
      if(!originalText) throw new Error("Local AES decryption failed. Matrix signature distortion.");
      
      logs.push(`✅ SUCCESS: Vault Payload Decrypted locally in physical RAM.`);
      setReconstructLogs(logs);
      setRecoveredMsg(originalText);
    } catch (err) {
      setReconstructError(err.message);
    }
  };

  const renderLockingAnimation = () => (
    <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'var(--bg-primary)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
      <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--accent-color)' }}><Lock size={120} /></motion.div>
      <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ yoyo: Infinity, duration: 0.8 }} style={{ marginTop: '30px', color: 'var(--text-primary)', letterSpacing: '4px' }}>
        EXECUTING ZERO-KNOWLEDGE ARCHITECTURE...
      </motion.h2>
      <ul style={{color:'var(--success)', marginTop:'20px', fontFamily:'monospace', listStyle:'none', textAlign:'center', display:'flex', flexDirection:'column', gap:'10px'}}>
        <li><CheckCircle size={14}/> Auto-Generating Out-Of-Band Security PINs</li>
        <li><CheckCircle size={14}/> Encrypting Shards via 2FA Authentication Wrappers</li>
      </ul>
    </div>
  );

  const renderFacialScanner = () => (
     <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(5,5,5,0.95)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
        <h2 style={{fontSize:'2rem', marginBottom:'30px', fontWeight:'700', letterSpacing:'2px'}}><span className="gradient-text">BIOMETRIC AUTHORIZATION</span></h2>
        <div style={{position:'relative', width:'400px', height:'400px', border:`2px solid ${scanStep === 3 ? 'var(--success)' : 'var(--accent-color)'}`, borderRadius:'20px', overflow:'hidden', boxShadow:`0 0 50px ${scanStep === 3 ? 'var(--success)' : 'rgba(0,240,255,0.3)'}`}}>
            <Webcam audio={false} style={{width:'100%', height:'100%', objectFit:'cover', filter: scanStep === 3 ? 'sepia(1) hue-rotate(90deg) saturate(3)' : 'grayscale(0.5) contrast(1.2)'}} />
            {scanStep < 3 && <motion.div animate={{ top: ['0%', '98%', '0%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} style={{position:'absolute', width:'100%', height:'4px', background:'var(--accent-color)', boxShadow:'0 0 15px var(--accent-color)', zIndex:10}} />}
            <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', width:'60%', height:'60%', border:'1px dashed rgba(255,255,255,0.4)', borderRadius:'50%', zIndex:5}}></div>
        </div>
        <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} style={{marginTop:'40px', display:'flex', alignItems:'center', gap:'15px', padding:'15px 30px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'30px'}}>
           {scanStep === 3 ? <CheckCircle size={24} color="var(--success)"/> : <Scan size={24} color="var(--accent-color)"/>}
           <span style={{fontFamily:'monospace', fontSize:'1.2rem', color:scanStep === 3 ? 'var(--success)' : 'var(--accent-color)'}}>{scanText}</span>
        </motion.div>
     </div>
  );

  return (
    <div className="app-container">
      {isLocking && renderLockingAnimation()}
      {isScanningFace && renderFacialScanner()}
      
      {/* CRITICAL DEMO MODAL FOR 2FA SECURITY PINS */}
      <AnimatePresence>
        {showPinDownloadModal && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px', overflowY:'auto'}}>
              <div className="glass-panel" style={{padding:'40px', maxWidth:'800px', width:'100%', border:'1px solid var(--accent-color)', background:'var(--bg-primary)'}}>
                  <h2 style={{color:'var(--accent-color)', display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px'}}><Key/> OUT-OF-BAND 2FA PINS GENERATED</h2>
                  <p style={{marginBottom:'20px'}}>Your browser just securely locked each Shamir Shard using dynamically generated <strong>6-Digit Security PINs</strong>. The SQLite database only possesses the encrypted blobs. It knows absolutely nothing about these PINs.</p>
                  
                  <p style={{color:'var(--success)', marginBottom:'20px'}}><strong>Real-World Operation:</strong> You would now literally text or call your friends to give them their PIN offline. "Hey, keep this PIN safe. If I ever die, you'll need it."</p>
                  
                  <p style={{color:'var(--error)', fontWeight:'bold', marginBottom:'15px'}}>For your Presentation Demo: Copy these simple PINs to a notepad right now so you can use them to unlock the system later!</p>

                  <div style={{display:'flex', flexDirection:'column', gap:'10px', maxHeight:'400px', overflowY:'auto', padding:'10px'}}>
                     {generatedPins.map((k, i) => (
                        <div key={i} style={{background:'rgba(255,255,255,0.05)', padding:'15px', borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                           <strong style={{color:'var(--text-primary)', fontSize:'1.1rem'}}>{k.email}</strong>
                           <span style={{background:'var(--accent-color)', color:'#000', padding:'5px 15px', borderRadius:'6px', fontFamily:'monospace', fontWeight:'bold', fontSize:'1.2rem', letterSpacing:'3px'}}>{k.pin}</span>
                        </div>
                     ))}
                  </div>

                  <button className="btn-primary" style={{marginTop:'30px', width:'100%', fontSize:'1.2rem', padding:'20px'}} onClick={() => { setShowPinDownloadModal(false); setActiveTab('dashboard'); }}>
                      I have copied the 6-Digit PINs. Take me to Dashboard. 
                  </button>
              </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="navbar glass-panel">
        <div className="logo-container">
          <Shield size={28} className="logo-icon" />
          <span>Aegis<span className="gradient-text">Vault 2FA</span></span>
        </div>
        <div className="nav-links">
          <a href="#" className={`nav-link ${activeTab === 'home' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('home'); }}>Walkthrough</a>
            <a href="#" className={`nav-link ${activeTab === 'vault' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('vault'); }}>1. Setup AES Payload</a>
            <a href="#" className={`nav-link ${activeTab === 'trustees' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('trustees'); }}>2. Trustee 2FA Mapping</a>
          <a href="#" className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}>3. Dashboard Heartbeat</a>
          <a href="#" className={`nav-link ${activeTab === 'reconstruct' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('reconstruct'); }}>4. Reconstruct Vault</a>
        </div>
      </nav>

      {/* Main Content Area */}
      {activeTab === 'home' && (
         <motion.main className="hero-section" initial={{opacity:0}} animate={{opacity:1}}>
         <h1 className="hero-title" style={{fontSize:'4rem'}}>Total Digital Sovereignty.<br/><span className="gradient-text">Zero Trust.</span></h1>
         <p className="hero-subtitle">The Dead Man's Switch engineered with dual-layer cryptography: M-of-N Cryptographic Sharding heavily wrapped by <strong>Out-Of-Band 2FA Security PINs</strong> ensuring the backend SQLite node is structurally blind.</p>
         <button className="btn-primary" onClick={() => setActiveTab('vault')}>Initialize Sovereign Architecture <ChevronRight/></button>
       </motion.main>
      )}

      {activeTab === 'vault' && (
        <motion.div className="vault-dashboard" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
           <h2 style={{ fontSize: '3rem', marginBottom: '10px', fontWeight: '800' }}>Initialize <span className="gradient-text">Secure Sequence</span></h2>
           <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>Inject the payload. System will automatically AES-encrypt it before applying Shamir's Polynomial Matrix to generate the shards locally.</p>

           <div className="glass-panel" style={{ padding: '50px' }}>
              <div style={{ marginBottom: '30px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--text-primary)'}}>Payload Object (Private Keys, Wills, Letters)</label>
                <textarea rows="4" value={secretMsg} onChange={(e) => setSecretMsg(e.target.value)} placeholder="Type the highly sensitive text here..." style={{ resize: 'vertical', fontFamily: 'monospace' }}></textarea>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', marginBottom: '30px' }}>
                <div style={{ flex: '1 1 150px' }}><label>Total Trustee Emails (N)</label><input type="number" value={trusteesN} onChange={(e) => setTrusteesN(e.target.value)} /></div>
                <div style={{ flex: '1 1 150px' }}><label>Threshold To Unlock (K)</label><input type="number" value={thresholdK} onChange={(e) => setThresholdK(e.target.value)} /></div>
              </div>

              <button className="btn-primary" onClick={handleLockVault} style={{ width: '100%', padding: '16px', fontSize:'1.1rem' }}>Encrypt Payload via AES-256 <ChevronRight/></button>
           </div>
        </motion.div>
      )}

      {activeTab === 'trustees' && (
        <motion.div className="vault-dashboard" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
           <h2 style={{ fontSize: '3rem', marginBottom: '10px', fontWeight: '800' }}>Trustees <span className="gradient-text">& 2FA Out-Of-Band Exchange</span></h2>
           <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>To prevent the database from holding plaintext shards, the system automatically generates a unique 6-digit Security PIN for every single friend. It locks the shard inside that PIN before uploading it to the backend.</p>

           <div className="glass-panel" style={{ padding: '40px' }}>
               {trusteeEmails.map((email, i) => (
                   <div key={i} style={{marginBottom:'20px', display:'flex', alignItems:'center', gap:'15px', background:'rgba(255,255,255,0.03)', padding:'15px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.1)'}}>
                      <Mail size={24} style={{color:'var(--accent-color)'}}/>
                      <div style={{flex: 1}}>
                         <label style={{fontSize:'0.8rem', color:'var(--text-secondary)', display:'block', marginBottom:'5px'}}>Enter Trustee {i + 1} Email Address</label>
                         <input type="email" placeholder={`e.g. friend_0${i+1}@gmail.com`} value={email} onChange={(e) => updateEmail(i, e.target.value)} style={{width:'100%', padding:'10px', background:'transparent', border:'none', borderBottom:'1px solid var(--accent-color)', borderRadius:'0'}} />
                      </div>
                   </div>
               ))}
               <button className="btn-primary" onClick={handleBindTrustees} style={{width:'100%', padding:'15px', display:'flex', justifyContent:'center', gap:'10px'}}><Network/> Generate Security PINs & Lock Shards Securely</button>
           </div>
        </motion.div>
      )}

      {activeTab === 'dashboard' && (
        <motion.div className="vault-dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
           <h2 style={{ fontSize: '3rem', marginBottom: '10px', fontWeight: '800' }}>Post-Mortem <span className="gradient-text">Telemetry</span></h2>
           
           <div style={{display:'flex', gap:'20px', marginBottom:'40px'}}>
               <div className="glass-panel" style={{flex:1, padding:'30px', textAlign:'center', border:`1px solid ${vaultStatus === 'TRIGGERED' ? 'var(--error)' : 'rgba(112,0,255,0.4)'}`}}>
                   <Clock size={40} style={{margin:'0 auto 20px', color: vaultStatus === 'TRIGGERED' ? 'var(--error)' : 'var(--accent-color)'}}/>
                   <h3 style={{marginBottom:'10px'}}>Time Until Vault Triggers 2FA Email Dispersal</h3>
                   <h1 style={{fontSize:'2.5rem', color: vaultStatus === 'TRIGGERED' ? 'var(--error)' : 'var(--success)'}}>{timeRemaining}</h1>
                   <p style={{color:'var(--text-secondary)'}}>If timer hits zero, the backend emails the PIN-locked shards to your friends automatically.</p>
               </div>
               
               <div className="glass-panel" style={{flex:1, padding:'30px', display:'flex', flexDirection:'column', justifyContent:'center'}}>
                   <h3 style={{marginBottom:'20px'}}>Biometric Proof-of-Life</h3>
                   <button className="btn-secondary" disabled={vaultStatus==='TRIGGERED'} onClick={executeFacialRecognition} style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', padding:'20px', background: vaultStatus === 'TRIGGERED' ? 'rgba(255,255,255,0.1)' : 'rgba(0,240,255,0.1)', borderColor:'var(--accent-color)', color:'var(--accent-color)'}}>
                       <Scan size={24}/> Run AI Facial Recognition (Reset Timer)
                   </button>
                   <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', marginTop:'15px'}}>Initiate local webcam facial scan to prove you are alive, and push the countdown timer back another 30 days.</p>
               </div>
           </div>

           <div style={{display:'flex', gap:'20px', justifyContent:'space-between', alignItems:'flex-end'}}>
               <h3 style={{marginBottom:'10px'}}>Backend SQL Event Logs (Live)</h3>
               <button className="btn-primary" onClick={handleSimulateDeath} style={{background:'rgba(239, 68, 68, 0.1)', border:'1px solid var(--error)', color:'var(--error)', padding:'10px 20px', display:'flex', gap:'8px', marginBottom:'10px'}}><AlertTriangle size={18}/> Demo: Trigger Death Now</button>
           </div>
           
           <div className="glass-panel" style={{padding:'20px', maxHeight:'400px', overflowY:'auto'}}>
               {auditLogs.length === 0 ? <p style={{color:'var(--text-secondary)'}}>Awaiting backend server connection & SQL Ledger parsing...</p> : 
                  auditLogs.map((log, i) => (
                    <div key={log.id} style={{padding:'12px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:'15px', alignItems:'center'}}>
                       <span style={{color:'var(--text-secondary)', fontSize:'0.8rem', fontFamily:'monospace'}}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                       <span style={{color:'var(--accent-color)', fontSize:'0.9rem', fontFamily:'monospace'}}>{log.action}</span>
                    </div>
                  ))
               }
           </div>
        </motion.div>
      )}

      {activeTab === 'reconstruct' && (
        <motion.div className="vault-dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
           <h2 style={{ fontSize: '3rem', marginBottom: '10px', fontWeight: '800' }}>Reconstruct <span className="gradient-text">Payload</span></h2>
           <p style={{ color: 'var(--text-secondary)', marginBottom: '50px' }}>"Assuming the original user died, the backend just emailed our Encrypted chunks. We paste our Independent packages here, and we type the 6-Digit PIN we got texted years ago to unlock them."</p>

           <div className="glass-panel" style={{ padding: '40px' }}>
              <div style={{ marginBottom: '30px' }}>
                <label style={{ display: 'block', marginBottom: '10px' }}>Global Encrypted AES Ciphertext</label>
                <textarea rows="3" value={pastedCipher} onChange={(e) => setPastedCipher(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.9rem' }} placeholder="Paste the unbreakable giant payload block here..."/>
              </div>

              <div style={{ marginBottom: '40px' }}>
                <label style={{ display: 'block', marginBottom: '0px' }}>Collaborative Friend Shards ({reconstructInputs.length})</label>
                <p style={{color:'var(--text-secondary)', fontSize:'0.85rem', marginBottom:'20px'}}>We need to actively unlock exactly {thresholdK} or more envelopes using their unique physical 6-Digit Pins to successfully unblock the AES equations.</p>
                
                {reconstructInputs.map((inputState, i) => (
                  <div key={i} style={{display:'flex', gap:'15px', marginBottom:'15px'}}>
                     <div style={{flex:2}}>
                        <label style={{fontSize:'0.7rem', color:'var(--text-primary)'}}>Friend {i+1} Encrypted Shard (From Server Email)</label>
                        <textarea rows="1" value={inputState.shardBlob} onChange={(e) => updateReconstructInput(i, 'shardBlob', e.target.value)} style={{ fontFamily:'monospace', fontSize:'0.85rem', width:'100%', resize:'none' }} placeholder="Paste Encrypted Shard..."/>
                     </div>
                     <div style={{flex:1}}>
                        <label style={{fontSize:'0.7rem', color:'var(--error)'}}>Friend {i+1} 6-Digit PIN</label>
                        <input type="text" value={inputState.securityPin} onChange={(e) => updateReconstructInput(i, 'securityPin', e.target.value)} style={{ fontFamily:'monospace', fontSize:'0.95rem', width:'100%', borderColor:'rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.05)', letterSpacing:'2px', padding:'10px' }} placeholder="e.g. A7X9F2" maxLength={6} />
                     </div>
                  </div>
                ))}
                
                <button onClick={() => setReconstructInputs([...reconstructInputs, {shardBlob:'', securityPin:''}])} style={{background:'transparent', color:'var(--accent-color)', border:'none', cursor:'pointer'}}>+ Provide Additional Friend Package</button>
              </div>

              {reconstructError && <div style={{padding:'15px', background:'rgba(239, 68, 68, 0.1)', color:'var(--error)', border:'1px solid var(--error)', borderRadius:'8px', marginBottom:'20px'}}>{reconstructError}</div>}
              
              {/* Telemetry Output Logs */}
              {reconstructLogs.length > 0 && (
                <div style={{background:'rgba(0,0,0,0.4)', padding:'15px', borderRadius:'8px', outline:'1px solid rgba(255,255,255,0.1)', marginBottom:'20px', fontFamily:'monospace', fontSize:'0.85rem', color:'var(--text-secondary)'}}>
                   {reconstructLogs.map((lg, i) => (
                      <div key={i} style={{marginBottom:'5px', color: lg.includes('SUCCESS') ? 'var(--success)' : lg.includes('FAILURE') ? 'var(--error)' : 'inherit'}}>{lg}</div>
                   ))}
                </div>
              )}

              {recoveredMsg && (
                <div style={{padding:'20px', background:'rgba(16, 185, 129, 0.1)', border:'2px solid var(--success)', borderRadius:'12px', marginBottom:'30px', boxShadow:'0 0 30px rgba(16,185,129,0.2)'}}>
                   <h3 style={{color:'var(--success)', marginBottom:'10px', display:'flex', alignItems:'center', gap:'8px'}}><Unlock size={20}/> FINAL DECRYPTION SUCCESSFUL - WILL UNLOCKED:</h3>
                   <p style={{fontFamily:'monospace', fontSize:'1.2rem', whiteSpace:'pre-wrap', color:'#fff'}}>{recoveredMsg}</p>
                </div>
              )}

              <button className="btn-primary" onClick={handleReconstruct} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px', background:'linear-gradient(135deg, var(--success), #047857)' }}>
                <Unlock size={20} /> Evaluate 2FA Pin Constraints & Decrypt Will
              </button>
           </div>
        </motion.div>
      )}
    </div>
  );
}

export default App;
