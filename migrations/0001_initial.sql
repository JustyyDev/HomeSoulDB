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