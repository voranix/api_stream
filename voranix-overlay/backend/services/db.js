const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const workspaceSeedPath = path.join(__dirname, "..", "data", "store.json");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no configurada. Para Render free usa Render Postgres.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      twitch_id TEXT UNIQUE NOT NULL,
      login TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT DEFAULT '',
      profile_image_url TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'streamer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      channel_id TEXT UNIQUE NOT NULL,
      twitch_channel TEXT UNIQUE NOT NULL,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      community_name TEXT NOT NULL,
      logo_text TEXT NOT NULL,
      accent TEXT NOT NULL,
      secondary_accent TEXT NOT NULL,
      logo_url TEXT DEFAULT '',
      persistent_message TEXT DEFAULT '',
      ticker_text TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sponsors (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      message TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS commands (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 7000,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  const existingChannels = await query("SELECT id FROM channels LIMIT 1");
  if (existingChannels.rowCount > 0 || !fs.existsSync(workspaceSeedPath)) {
    return;
  }

  const raw = JSON.parse(fs.readFileSync(workspaceSeedPath, "utf8"));
  const channels = Object.values(raw.channels || {});

  await withTransaction(async (client) => {
    for (const channel of channels) {
      const insertedChannel = await client.query(
        `INSERT INTO channels (
          channel_id,
          twitch_channel,
          community_name,
          logo_text,
          accent,
          secondary_accent,
          logo_url,
          persistent_message,
          ticker_text
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id`,
        [
          channel.channelId,
          channel.twitchChannel,
          channel.branding.communityName,
          channel.branding.logoText,
          channel.branding.accent,
          channel.branding.secondaryAccent,
          channel.branding.logoUrl || "",
          channel.branding.persistentMessage || "",
          channel.branding.tickerText || ""
        ]
      );

      const channelDbId = insertedChannel.rows[0].id;

      for (const [index, sponsor] of (channel.sponsors || []).entries()) {
        await client.query(
          `INSERT INTO sponsors (channel_id, name, message, logo_url, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [channelDbId, sponsor.name, sponsor.message || "", sponsor.logoUrl || "", index]
        );
      }

      for (const [index, command] of (channel.commands || []).entries()) {
        await client.query(
          `INSERT INTO commands (channel_id, trigger, type, title, message, duration_ms, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            channelDbId,
            command.trigger,
            command.type,
            command.title,
            command.message || "",
            command.durationMs || 7000,
            index
          ]
        );
      }
    }
  });
}

module.exports = {
  pool,
  query,
  withTransaction,
  initializeDatabase
};
