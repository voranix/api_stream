const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const workspaceDataDirectory = path.join(__dirname, "..", "data");
const defaultSystemDirectory = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "VoranixOverlay")
  : workspaceDataDirectory;
const databasePath = process.env.DATABASE_PATH || path.join(defaultSystemDirectory, "voranix.sqlite");
const dataDirectory = path.dirname(databasePath);
const seedPath = path.join(dataDirectory, "store.json");
const workspaceSeedPath = path.join(workspaceDataDirectory, "store.json");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

const db = new Database(databasePath);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    twitch_id TEXT UNIQUE NOT NULL,
    login TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT DEFAULT '',
    profile_image_url TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'streamer',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT UNIQUE NOT NULL,
    twitch_channel TEXT UNIQUE NOT NULL,
    owner_user_id INTEGER,
    community_name TEXT NOT NULL,
    logo_text TEXT NOT NULL,
    accent TEXT NOT NULL,
    secondary_accent TEXT NOT NULL,
    logo_url TEXT DEFAULT '',
    persistent_message TEXT DEFAULT '',
    ticker_text TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sponsors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    message TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 7000,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );
`);

function hasAnyChannels() {
  return Boolean(db.prepare("SELECT id FROM channels LIMIT 1").get());
}

function seedFromJsonStore() {
  const sourceSeedPath = fs.existsSync(seedPath) ? seedPath : workspaceSeedPath;

  if (hasAnyChannels() || !fs.existsSync(sourceSeedPath)) {
    return;
  }

  const raw = JSON.parse(fs.readFileSync(sourceSeedPath, "utf8"));
  const channels = Object.values(raw.channels || {});

  const insertChannel = db.prepare(`
    INSERT INTO channels (
      channel_id,
      twitch_channel,
      community_name,
      logo_text,
      accent,
      secondary_accent,
      logo_url,
      persistent_message,
      ticker_text
    ) VALUES (
      @channel_id,
      @twitch_channel,
      @community_name,
      @logo_text,
      @accent,
      @secondary_accent,
      @logo_url,
      @persistent_message,
      @ticker_text
    )
  `);
  const insertSponsor = db.prepare(`
    INSERT INTO sponsors (channel_id, name, message, logo_url, sort_order)
    VALUES (@channel_id, @name, @message, @logo_url, @sort_order)
  `);
  const insertCommand = db.prepare(`
    INSERT INTO commands (channel_id, trigger, type, title, message, duration_ms, sort_order)
    VALUES (@channel_id, @trigger, @type, @title, @message, @duration_ms, @sort_order)
  `);

  const transaction = db.transaction(() => {
    for (const channel of channels) {
      const channelInsert = insertChannel.run({
        channel_id: channel.channelId,
        twitch_channel: channel.twitchChannel,
        community_name: channel.branding.communityName,
        logo_text: channel.branding.logoText,
        accent: channel.branding.accent,
        secondary_accent: channel.branding.secondaryAccent,
        logo_url: channel.branding.logoUrl || "",
        persistent_message: channel.branding.persistentMessage || "",
        ticker_text: channel.branding.tickerText || ""
      });

      for (const [index, sponsor] of (channel.sponsors || []).entries()) {
        insertSponsor.run({
          channel_id: channelInsert.lastInsertRowid,
          name: sponsor.name,
          message: sponsor.message || "",
          logo_url: sponsor.logoUrl || "",
          sort_order: index
        });
      }

      for (const [index, command] of (channel.commands || []).entries()) {
        insertCommand.run({
          channel_id: channelInsert.lastInsertRowid,
          trigger: command.trigger,
          type: command.type,
          title: command.title,
          message: command.message || "",
          duration_ms: command.durationMs || 7000,
          sort_order: index
        });
      }
    }
  });

  transaction();
}

seedFromJsonStore();

module.exports = {
  db
};
