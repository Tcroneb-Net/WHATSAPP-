const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const archiver = require('archiver');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let activeClients = {};

app.get('/qr', async (req, res) => {
    const id = req.query.id;
    if (!id || !activeClients[id]) {
        return res.json({ error: 'Invalid or expired session' });
    }

    const session = activeClients[id];
    res.json({ qr: session.qr, pairCode: session.pairCode });
});

app.post('/start', async (req, res) => {
    const phone = req.body.phone || '';
    const sessionId = phone ? `session-${phone}` : crypto.randomBytes(4).toString('hex');
    const sessionPath = `./.sessions/${sessionId}`;
    const pairCode = crypto.randomBytes(4).toString('hex');

    fs.ensureDirSync(sessionPath);

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionPath }),
        puppeteer: { headless: true }
    });

    activeClients[sessionId] = { qr: '', pairCode };

    client.on('qr', async (qr) => {
        const qrImg = await QRCode.toDataURL(qr);
        activeClients[sessionId].qr = qrImg;
    });

    client.on('ready', async () => {
        console.log(`✅ [${sessionId}] Ready`);
        const zipPath = `./sessions/${pairCode}.zip`;
        fs.ensureDirSync('./sessions');

        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');
        archive.pipe(output);
        archive.directory(sessionPath, false);
        await archive.finalize();
    });

    client.initialize();

    res.redirect(`/pair.html?id=${sessionId}`);
});

app.listen(PORT, () => {
    console.log(`🌍 Running on http://localhost:${PORT}`);
});
