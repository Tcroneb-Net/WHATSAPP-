const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');
const Mega = require('mega');

const app = express();
const PORT = process.env.PORT || 3000;

const sessionsFolder = './sessions';
const sessionBasePath = './.sessions';
fs.ensureDirSync(sessionsFolder);
fs.ensureDirSync(sessionBasePath);

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const megaEmail = 'thelastcroneb@gmail.com';       // <-- REPLACE
const megaPassword = 'Tcroneb/2025';             // <-- REPLACE

// Active clients storage
let activeClients = {};

// Upload ZIP to MEGA and return public link
async function uploadToMega(zipPath, filename) {
    return new Promise((resolve, reject) => {
        const storage = Mega({ email: megaEmail, password: megaPassword });
        storage.on('ready', () => {
            const upload = storage.upload(filename, fs.createReadStream(zipPath));
            upload.on('complete', () => {
                const file = storage.files.find(f => f.name === filename);
                if (!file) return reject('File not found after upload');
                const publicLink = storage.getPublicLink(file);
                resolve(publicLink);
            });
            upload.on('error', reject);
        });
        storage.on('error', reject);
    });
}

// Zip session folder
async function zipSession(sessionDir, pairCode) {
    const zipPath = path.join(sessionsFolder, `${pairCode}.zip`);
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');
        output.on('close', () => resolve(zipPath));
        archive.on('error', err => reject(err));
        archive.pipe(output);
        archive.directory(sessionDir, false);
        archive.finalize();
    });
}

app.get('/qr', (req, res) => {
    const id = req.query.id;
    if (!id || !activeClients[id]) {
        return res.json({ error: 'Invalid or expired session' });
    }
    res.json({ qr: activeClients[id].qr, pairCode: activeClients[id].pairCode, megaLink: activeClients[id].megaLink || null });
});

app.post('/start', async (req, res) => {
    try {
        const phone = req.body.phone || '';
        const sessionId = phone ? `session-${phone}` : crypto.randomBytes(4).toString('hex');
        const sessionPath = path.join(sessionBasePath, sessionId);
        const pairCode = crypto.randomBytes(4).toString('hex');

        fs.ensureDirSync(sessionPath);

        const client = new Client({
            authStrategy: new LocalAuth({ dataPath: sessionPath }),
            puppeteer: { headless: true }
        });

        activeClients[sessionId] = { qr: '', pairCode, megaLink: null };

        client.on('qr', async (qr) => {
            activeClients[sessionId].qr = await QRCode.toDataURL(qr);
        });

        client.on('ready', async () => {
            console.log(`✅ [${sessionId}] WhatsApp ready.`);

            // Zip session
            const zipFile = await zipSession(sessionPath, pairCode);
            console.log(`🗂️ Session zipped at ${zipFile}`);

            // Upload to MEGA
            try {
                const megaLink = await uploadToMega(zipFile, `${pairCode}.zip`);
                activeClients[sessionId].megaLink = megaLink;
                console.log(`📤 Uploaded session ZIP to MEGA: ${megaLink}`);
            } catch (e) {
                console.error('❌ MEGA upload failed:', e);
            }

            // Send welcome message to user
            try {
                const me = await client.getMe();
                const chatId = `${me.id.user}@c.us`;
                await client.sendMessage(chatId, `✅ *Login Successful!*\nWelcome to your WhatsApp Bot.\n\n🔗 *Pair Code:* ${pairCode}\n🗂️ Your session is saved.`);
                console.log(`📩 Sent welcome message to ${chatId}`);
            } catch (err) {
                console.error('❌ Failed to send welcome message:', err.message);
            }
        });

        client.initialize();

        // Redirect user to pairing page with sessionId
        res.redirect(`/pair.html?id=${sessionId}`);
    } catch (err) {
        console.error('❌ /start error:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Server running at http://localhost:${PORT}`);
});
