const json = (data, init = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
};

const textResponse = (body, init = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(body, { ...init, headers });
};

const sanitizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .slice(0, 18);

const sanitizeText = (value, maxLength) =>
  String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

async function ensureSchema(env) {
  await env.COVE_DB.exec(`
    CREATE TABLE IF NOT EXISTS presence (
      username TEXT PRIMARY KEY,
      gender TEXT NOT NULL,
      body_color TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stands (
      stand_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      mod_title TEXT NOT NULL,
      billboard_text TEXT NOT NULL,
      booth_theme TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_rooms (
      room_id TEXT PRIMARY KEY,
      host_stand_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      backend_state TEXT NOT NULL,
      signaling_path TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

async function getCatalog(env, forceRefresh = false) {
  const cacheKey = 'catalog-cache';
  if (!forceRefresh) {
    const cached = await env.COVE_CACHE.get(cacheKey, 'json');
    if (cached) return cached;
  }
  const response = await fetch(env.CATALOG_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
  const catalog = response.ok ? await response.json() : [];
  await env.COVE_CACHE.put(cacheKey, JSON.stringify(catalog), { expirationTtl: 300 });
  return catalog;
}

async function getState(env) {
  const [presenceRes, standsRes, chatRes, voiceRes] = await Promise.all([
    env.COVE_DB.prepare('SELECT payload FROM presence ORDER BY updated_at DESC').all(),
    env.COVE_DB.prepare('SELECT payload FROM stands ORDER BY updated_at DESC').all(),
    env.COVE_DB.prepare('SELECT author, text, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 24').all(),
    env.COVE_DB.prepare('SELECT payload FROM voice_rooms ORDER BY updated_at DESC').all()
  ]);

  return {
    presence: (presenceRes.results || []).map((row) => JSON.parse(row.payload)),
    stands: (standsRes.results || []).map((row) => JSON.parse(row.payload)),
    chatFeed: (chatRes.results || []).reverse(),
    voiceRooms: (voiceRes.results || []).map((row) => JSON.parse(row.payload)),
    updatedAt: Date.now()
  };
}

async function storePresenceSnapshot(env, snapshot) {
  const now = Date.now();
  const profile = snapshot.profile || {};
  const username = sanitizeName(profile.username || 'guest');
  await env.COVE_DB.prepare(
    `INSERT INTO presence (username, gender, body_color, payload, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET gender=excluded.gender, body_color=excluded.body_color, payload=excluded.payload, updated_at=excluded.updated_at`
  )
    .bind(username, profile.gender || 'male', profile.bodyColor || '0xFF35D0BA', JSON.stringify({ ...profile, username }), now)
    .run();

  const stands = Array.isArray(snapshot.stands) ? snapshot.stands : [];
  for (const stand of stands) {
    const safeStand = {
      ...stand,
      standId: sanitizeText(stand.standId || '', 32),
      owner: sanitizeName(stand.owner || username),
      modTitle: sanitizeText(stand.modTitle || 'Untitled Homebrew', 48),
      billboardText: sanitizeText(stand.billboardText || 'Playable build live here.', 84),
      boothTheme: sanitizeText(stand.boothTheme || 'homebrew', 24),
      compatibleModes: Array.isArray(stand.compatibleModes) ? stand.compatibleModes.map((entry) => sanitizeText(entry, 32)) : ['singleplayer', 'plaza-multiplayer']
    };
    await env.COVE_DB.prepare(
      `INSERT INTO stands (stand_id, owner, mod_title, billboard_text, booth_theme, expires_at, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(stand_id) DO UPDATE SET owner=excluded.owner, mod_title=excluded.mod_title, billboard_text=excluded.billboard_text, booth_theme=excluded.booth_theme, expires_at=excluded.expires_at, payload=excluded.payload, updated_at=excluded.updated_at`
    )
      .bind(safeStand.standId, safeStand.owner, safeStand.modTitle, safeStand.billboardText, safeStand.boothTheme, Number(safeStand.expiresAt || now), JSON.stringify(safeStand), now)
      .run();
  }

  const voiceRooms = Array.isArray(snapshot.voiceRooms) ? snapshot.voiceRooms : [];
  for (const room of voiceRooms) {
    const safeRoom = {
      ...room,
      roomId: sanitizeText(room.roomId || '', 48),
      hostStandId: sanitizeText(room.hostStandId || '', 32),
      roomName: sanitizeText(room.roomName || 'HomeSoul Voice Room', 48),
      backendState: sanitizeText(room.backendState || 'awaiting-signal-server', 32),
      signalingPath: sanitizeText(room.signalingPath || '/api/cove/voice', 128)
    };
    await env.COVE_DB.prepare(
      `INSERT INTO voice_rooms (room_id, host_stand_id, room_name, backend_state, signaling_path, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(room_id) DO UPDATE SET host_stand_id=excluded.host_stand_id, room_name=excluded.room_name, backend_state=excluded.backend_state, signaling_path=excluded.signaling_path, payload=excluded.payload, updated_at=excluded.updated_at`
    )
      .bind(safeRoom.roomId, safeRoom.hostStandId, safeRoom.roomName, safeRoom.backendState, safeRoom.signalingPath, JSON.stringify(safeRoom), now)
      .run();
  }

  const chatFeed = Array.isArray(snapshot.chatFeed) ? snapshot.chatFeed : [];
  for (const message of chatFeed.slice(-8)) {
    await env.COVE_DB.prepare('INSERT INTO chat_messages (author, text, timestamp) VALUES (?, ?, ?)')
      .bind(sanitizeName(message.author || username), sanitizeText(message.text || '', 92), Number(message.timestamp || now))
      .run();
  }
}

async function appendChat(env, payload) {
  const author = sanitizeName(payload.author || 'guest');
  const text = sanitizeText(payload.text || '', 92);
  if (!text) return { ok: false, error: 'Chat text is required' };

  const timestamp = Date.now();
  await env.COVE_DB.prepare('INSERT INTO chat_messages (author, text, timestamp) VALUES (?, ?, ?)')
    .bind(author, text, timestamp)
    .run();
  return { ok: true, author, text, timestamp };
}

async function routeRequest(request, env) {
  await ensureSchema(env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } });

  const url = new URL(request.url);

  if (url.pathname === '/health') return textResponse('ok');
  if (url.pathname === '/api/catalog') return json(await getCatalog(env, url.searchParams.get('refresh') === '1'));
  if (url.pathname === '/api/cove/state') return json(await getState(env));

  if (url.pathname === '/api/cove/presence' && request.method === 'POST') {
    const payload = await request.json();
    await storePresenceSnapshot(env, payload || {});
    return json({ ok: true, updatedAt: Date.now() });
  }

  if (url.pathname === '/api/cove/chat' && request.method === 'POST') {
    const payload = await request.json();
    const result = await appendChat(env, payload || {});
    return json(result, { status: result.ok ? 200 : 400 });
  }

  if (url.pathname.startsWith('/api/cove/voice/')) {
    const roomId = sanitizeText(url.pathname.split('/').pop(), 48);
    const room = await env.COVE_DB.prepare('SELECT payload FROM voice_rooms WHERE room_id = ? OR host_stand_id = ? LIMIT 1').bind(roomId, roomId).first();
    if (!room) return json({ ok: false, error: 'Voice room not found' }, { status: 404 });
    return json(JSON.parse(room.payload));
  }

  return json({ ok: false, error: 'Not found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
};