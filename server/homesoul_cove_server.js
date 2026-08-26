const fs = require('fs');
const path = require('path');
const http = require('http');

const port = Number(process.env.PORT || 3187);
const statePath = path.join(__dirname, '../data/cove-state.json');

function loadState() {
  if (!fs.existsSync(statePath)) {
    return {
      presence: {},
      stands: [],
      chatFeed: [],
      voiceRooms: [],
      updatedAt: 0
    };
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {
      presence: {},
      stands: [],
      chatFeed: [],
      voiceRooms: [],
      updatedAt: 0
    };
  }
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function sanitizeName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .slice(0, 18);
}

function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function mergePresence(state, snapshot) {
  const username = sanitizeName(snapshot.profile && snapshot.profile.username ? snapshot.profile.username : 'guest');
  state.presence[username] = {
    username,
    gender: snapshot.profile && snapshot.profile.gender ? snapshot.profile.gender : 'male',
    bodyColor: snapshot.profile && snapshot.profile.bodyColor ? snapshot.profile.bodyColor : '0xFF35D0BA',
    updatedAt: Date.now()
  };
  state.stands = Array.isArray(snapshot.stands) ? snapshot.stands : [];
  state.chatFeed = Array.isArray(snapshot.chatFeed) ? snapshot.chatFeed.slice(-24) : [];
  state.voiceRooms = Array.isArray(snapshot.voiceRooms) ? snapshot.voiceRooms : [];
  state.updatedAt = Date.now();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const state = loadState();

  if (req.method === 'GET' && url.pathname === '/api/cove/state') {
    sendJson(res, 200, state);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/cove/voice/')) {
    const standId = url.pathname.split('/').pop();
    const room = state.voiceRooms.find(entry => entry.hostStandId === standId || entry.roomId === standId);
    if (!room) {
      sendJson(res, 404, { error: 'Voice room not found' });
      return;
    }
    sendJson(res, 200, room);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/cove/presence') {
    try {
      const payload = JSON.parse(await readBody(req) || '{}');
      mergePresence(state, payload);
      saveState(state);
      sendJson(res, 200, { ok: true, updatedAt: state.updatedAt });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/cove/chat') {
    try {
      const payload = JSON.parse(await readBody(req) || '{}');
      const author = sanitizeName(payload.author || 'guest');
      const text = sanitizeText(payload.text || '', 92);
      if (!text) {
        sendJson(res, 400, { ok: false, error: 'Chat text is required' });
        return;
      }
      state.chatFeed.push({ author, text, timestamp: Date.now() });
      state.chatFeed = state.chatFeed.slice(-24);
      state.updatedAt = Date.now();
      saveState(state);
      sendJson(res, 200, { ok: true, chatFeed: state.chatFeed });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(port, () => {
  console.log(`HomeSoul Cove server listening on http://localhost:${port}`);
});