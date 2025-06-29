const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const archiver = require('archiver');
const crypto = require('crypto');
const { Storage } = require('megajs');

const app = express();
const PORT = process.env.PORT || 3000;

// 🛠 MEGA login (⚠️ Replace with yours or use env)
const MEGA_EMAIL = 'thelastcroneb@gmail.com';
const MEGA_PASSWORD = 'Tcroneb/Hackx';

// File paths
const sessionBasePath = './.sessions';
const zipFolder = './sessions';
fs.ensureDirSync(sessionBasePath);
fs.ensureDirSync(zipFolder);

// Express setup
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let activeClients = {}; // Track live sessions by ID

// 🔁 Upload ZIP to MEGA using megajs
async function uploadToMega(zipPath, fileName) {
  const storage = await new Storage({
    email: MEGA_EMAIL,
    password: MEGA_PASSWORD
  }).ready;

  const file = await storage.upload(fileName, fs.createReadStream(zipPath)).complete;
  return file.link(); // Direct MEGA download link
}

// 🗜️ Create session ZIP
async function zipSession(folderPath, code) {
  const zipPath = path.join(zipFolder, `${code}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(zipPath));
    archive.on('error', err => reject(err));
    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

// 📥 Start session request (via web form)
app.post('/start', async (req, res) => {
  const phone = req.body.phone || '';
  const sessionId = phone ? `session-${phone}` : crypto.randomBytes(4).toString('hex');
  const pairCode = crypto.randomBytes(4).toString('hex');
  const sessionPath = path.join(sessionBasePath, sessionId);

  fs.ensureDirSync(sessionPath);
  activeClients[sessionId] = { qr: '', pairCode, megaLink: null };

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: { headless: true }
  });

  client.on('qr', async (qr) => {
    const qrImg = await QRCode.toDataURL(qr);
    activeClients[sessionId].qr = qrImg;
  });

  client.on('ready', async () => {
    console.log(`✅ WhatsApp ready for session: ${sessionId}`);

    // Step 1: ZIP the session
    const zipPath = await zipSession(sessionPath, pairCode);

    // Step 2: Upload to MEGA
    try {
      const megaLink = await uploadToMega(zipPath, `${pairCode}.zip`);
      activeClients[sessionId].megaLink = megaLink;
      console.log(`📤 MEGA uploaded: ${megaLink}`);
    } catch (err) {
      console.error('❌ MEGA upload failed:', err.message);
    }

    // Step 3: Send welcome message to self
    try {
      const me = await client.getMe();
      const chatId = `${me.id.user}@c.us`;
      await client.sendMessage(chatId, `✅ *Login Successful!*\n\nWelcome to your WhatsApp Bot.\n\n🔗 *Pair Code:* ${pairCode}\n📦 *Download Session:* ${activeClients[sessionId].megaLink || 'Unavailable'}`);
      console.log(`📩 Welcome message sent to ${chatId}`);
    } catch (e) {
      console.error('❌ Failed to send message:', e.message);
    }
  });

  client.initialize();

  // Redirect to QR page
  res.redirect(`/pair.html?id=${sessionId}`);
});

// 🔍 Serve QR + Pair Code + MEGA Link
app.get('/qr', (req, res) => {
  const id = req.query.id;
  const session = activeClients[id];
  if (!session) return res.json({ error: 'Invalid session' });
  res.json(session);
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🌍 Running on http://localhost:${PORT}`);
});
