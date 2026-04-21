const { db } = require("./db");

const DEFAULT_BRANDING = {
  communityName: "Comunidad Voranix",
  logoText: "VORANIX",
  accent: "#f97316",
  secondaryAccent: "#22c55e",
  logoUrl: "",
  persistentMessage: "Patrocinadores, eventos y anuncios oficiales de la comunidad.",
  tickerText: "Sigue las novedades de Voranix en directo."
};

function normalizeChannelId(channelId) {
  return String(channelId || "voranix")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/\s+/g, "-");
}

function sanitizeCommand(command, index) {
  return {
    trigger: String(command.trigger || `!cmd${index + 1}`).trim().toLowerCase(),
    type: String(command.type || "promo").trim().toLowerCase(),
    title: String(command.title || "Comando").trim(),
    message: String(command.message || "").trim(),
    durationMs: Number(command.durationMs) > 0 ? Number(command.durationMs) : 7000
  };
}

function sanitizeSponsor(sponsor) {
  return {
    name: String(sponsor.name || "Sponsor").trim(),
    message: String(sponsor.message || "").trim(),
    logoUrl: String(sponsor.logoUrl || "").trim()
  };
}

function sanitizeBranding(branding, fallback = DEFAULT_BRANDING, channelId = "voranix") {
  return {
    communityName: String(
      branding.communityName || fallback.communityName || `Canal ${channelId}`
    ).trim(),
    logoText: String(branding.logoText || fallback.logoText || channelId.toUpperCase()).trim(),
    accent: String(branding.accent || fallback.accent || "#f97316").trim(),
    secondaryAccent: String(
      branding.secondaryAccent || fallback.secondaryAccent || "#22c55e"
    ).trim(),
    logoUrl: String(branding.logoUrl || fallback.logoUrl || "").trim(),
    persistentMessage: String(
      branding.persistentMessage || fallback.persistentMessage || ""
    ).trim(),
    tickerText: String(branding.tickerText || fallback.tickerText || "").trim()
  };
}

function mapChannelRow(row) {
  if (!row) return null;

  const sponsors = db
    .prepare(
      `SELECT name, message, logo_url AS logoUrl
       FROM sponsors
       WHERE channel_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(row.id);

  const commands = db
    .prepare(
      `SELECT trigger, type, title, message, duration_ms AS durationMs
       FROM commands
       WHERE channel_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(row.id);

  return {
    channelId: row.channel_id,
    twitchChannel: row.twitch_channel,
    ownerUserId: row.owner_user_id,
    branding: {
      communityName: row.community_name,
      logoText: row.logo_text,
      accent: row.accent,
      secondaryAccent: row.secondary_accent,
      logoUrl: row.logo_url || "",
      persistentMessage: row.persistent_message || "",
      tickerText: row.ticker_text || ""
    },
    sponsors,
    commands
  };
}

function getChannelRowByChannelId(channelId) {
  return db
    .prepare("SELECT * FROM channels WHERE channel_id = ?")
    .get(normalizeChannelId(channelId));
}

function getChannelRowByTwitchChannel(twitchChannel) {
  return db
    .prepare("SELECT * FROM channels WHERE twitch_channel = ?")
    .get(normalizeChannelId(twitchChannel));
}

function insertDefaultChannel(channelId, ownerUserId = null) {
  const safeChannelId = normalizeChannelId(channelId);
  const branding = sanitizeBranding({}, DEFAULT_BRANDING, safeChannelId);

  const result = db
    .prepare(
      `INSERT INTO channels (
        channel_id,
        twitch_channel,
        owner_user_id,
        community_name,
        logo_text,
        accent,
        secondary_accent,
        logo_url,
        persistent_message,
        ticker_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      safeChannelId,
      safeChannelId,
      ownerUserId,
      branding.communityName,
      branding.logoText,
      branding.accent,
      branding.secondaryAccent,
      branding.logoUrl,
      branding.persistentMessage,
      branding.tickerText
    );

  db.prepare(
    `INSERT INTO sponsors (channel_id, name, message, logo_url, sort_order)
     VALUES (?, ?, ?, ?, 0)`
  ).run(
    result.lastInsertRowid,
    "Patrocinador Principal",
    "Apoya a quienes impulsan la comunidad Voranix.",
    ""
  );

  db.prepare(
    `INSERT INTO commands (channel_id, trigger, type, title, message, duration_ms, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(
    result.lastInsertRowid,
    "!promo",
    "promo",
    "Promo Voranix",
    "Visita a nuestros patrocinadores oficiales y apoya la comunidad.",
    7000
  );

  return getChannel(safeChannelId);
}

function getChannel(channelId) {
  return mapChannelRow(getChannelRowByChannelId(channelId));
}

function getOrCreateChannel(channelId, ownerUserId = null) {
  const existing = getChannel(channelId);
  if (existing) return existing;
  return insertDefaultChannel(channelId, ownerUserId);
}

function assignChannelOwner(channelId, ownerUserId) {
  db.prepare("UPDATE channels SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?").run(
    ownerUserId,
    normalizeChannelId(channelId)
  );
}

function ensureOwnedChannelForUser(user) {
  const safeChannelId = normalizeChannelId(user.login);
  const existing = getChannel(safeChannelId);

  if (!existing) {
    return insertDefaultChannel(safeChannelId, user.id);
  }

  if (!existing.ownerUserId) {
    assignChannelOwner(safeChannelId, user.id);
  }

  return getChannel(safeChannelId);
}

function getAllChannels() {
  return db
    .prepare("SELECT * FROM channels ORDER BY channel_id ASC")
    .all()
    .map(mapChannelRow);
}

function getAccessibleChannels(user) {
  if (!user) return [];
  if (user.role === "admin") {
    return getAllChannels();
  }

  const owned = ensureOwnedChannelForUser(user);
  return owned ? [owned] : [];
}

function getPublicChannelConfig(channelId) {
  const channel = getOrCreateChannel(channelId);
  return {
    channelId: channel.channelId,
    twitchChannel: channel.twitchChannel,
    branding: channel.branding,
    sponsors: channel.sponsors
  };
}

function findChannelByTwitchChannel(twitchChannel) {
  return mapChannelRow(getChannelRowByTwitchChannel(twitchChannel));
}

function canManageChannel(user, channelId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return normalizeChannelId(user.login) === normalizeChannelId(channelId);
}

function saveChannel(channelId, payload, options = {}) {
  const safeChannelId = normalizeChannelId(channelId);
  const existing = getOrCreateChannel(safeChannelId, options.ownerUserId || null);
  const branding = sanitizeBranding(payload.branding || {}, existing.branding, safeChannelId);
  const commands =
    Array.isArray(payload.commands) && payload.commands.length
      ? payload.commands.map(sanitizeCommand)
      : existing.commands;
  const sponsors =
    Array.isArray(payload.sponsors) && payload.sponsors.length
      ? payload.sponsors.map(sanitizeSponsor)
      : existing.sponsors;
  const nextTwitchChannel = normalizeChannelId(
    payload.twitchChannel || existing.twitchChannel || safeChannelId
  );

  db.exec("BEGIN");

  try {
    const row = getChannelRowByChannelId(safeChannelId);

    db.prepare(
      `UPDATE channels
       SET twitch_channel = ?,
           owner_user_id = COALESCE(?, owner_user_id),
           community_name = ?,
           logo_text = ?,
           accent = ?,
           secondary_accent = ?,
           logo_url = ?,
           persistent_message = ?,
           ticker_text = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      nextTwitchChannel,
      options.ownerUserId || null,
      branding.communityName,
      branding.logoText,
      branding.accent,
      branding.secondaryAccent,
      branding.logoUrl,
      branding.persistentMessage,
      branding.tickerText,
      row.id
    );

    db.prepare("DELETE FROM commands WHERE channel_id = ?").run(row.id);
    const insertCommand = db.prepare(
      `INSERT INTO commands (channel_id, trigger, type, title, message, duration_ms, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    commands.forEach((command, index) => {
      insertCommand.run(
        row.id,
        command.trigger,
        command.type,
        command.title,
        command.message,
        command.durationMs,
        index
      );
    });

    if (options.allowSponsorEdit) {
      db.prepare("DELETE FROM sponsors WHERE channel_id = ?").run(row.id);
      const insertSponsor = db.prepare(
        `INSERT INTO sponsors (channel_id, name, message, logo_url, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      );
      sponsors.forEach((sponsor, index) => {
        insertSponsor.run(row.id, sponsor.name, sponsor.message, sponsor.logoUrl, index);
      });
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getChannel(safeChannelId);
}

module.exports = {
  getAllChannels,
  getAccessibleChannels,
  getChannel,
  getOrCreateChannel,
  saveChannel,
  ensureOwnedChannelForUser,
  canManageChannel,
  findChannelByTwitchChannel,
  getPublicChannelConfig,
  normalizeChannelId
};
