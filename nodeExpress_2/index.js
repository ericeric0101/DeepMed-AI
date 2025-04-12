function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (e) {
    console.error("Error parsing JWT:", e);
    return null;
  }
}

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ 設定 CORS
app.use(cors({
  origin: 'https://deepmedai.zeabur.app',
  credentials: true
}));

// ✅ 解析 body
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Proxy endpoint
app.post('/proxy', async (req, res) => {
  try {
    const googleAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbzz4KKb1A3Dt9dFQb9txfjDMQLrMxmsiJ7NSJ5UWG_Rofst5CLdsYldrx1qd793A3N8/exec';

    // ✅ 紀錄 email，如果是 recordEmail action
    const { action, idToken } = req.body;
    const now = new Date();
    if (action === 'recordEmail' && idToken) {
      const decoded = parseJwt(idToken);
      if (decoded && decoded.email) {
        console.log(`[EMAIL RECORDED] ${now.toLocaleString()} - ${decoded.email}`);
      } else {
        console.warn(`[EMAIL RECORD WARNING] ID Token missing email: ${idToken}`);
      }
    }

    const response = await fetch(googleAppsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(req.body)
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Error proxying request:', error);
    res.status(500).json({ error: 'Internal proxy error' });
  }
});

// ✅ 測試 GET endpoint
app.get('/', (req, res) => {
  res.send('🟢 Zeabur Proxy Server is running!');
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
