const { query, withTransaction } = require("./db");

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

async function getSponsorsByChannelDbId(channelDbId) {
  const result = await query(
    `SELECT name, message, logo_url AS "logoUrl"
     FROM sponsors
     WHERE channel_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [channelDbId]
  );

  return result.rows;
}

async function getCommandsByChannelDbId(channelDbId) {
  const result = await query(
    `SELECT trigger, type, title, message, duration_ms AS "durationMs"
     FROM commands
     WHERE channel_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [channelDbId]
  );

  return result.rows;
}

async function mapChannelRow(row) {
  if (!row) return null;

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
    sponsors: await getSponsorsByChannelDbId(row.id),
    commands: await getCommandsByChannelDbId(row.id)
  };
}

async function getChannelRowByChannelId(channelId) {
  const result = await query("SELECT * FROM channels WHERE channel_id = $1", [
    normalizeChannelId(channelId)
  ]);
  return result.rows[0] || null;
}

async function getChannelRowByTwitchChannel(twitchChannel) {
  const result = await query("SELECT * FROM channels WHERE twitch_channel = $1", [
    normalizeChannelId(twitchChannel)
  ]);
  return result.rows[0] || null;
}

async function insertDefaultChannel(channelId, ownerUserId = null) {
  const safeChannelId = normalizeChannelId(channelId);
  const branding = sanitizeBranding({}, DEFAULT_BRANDING, safeChannelId);

  return withTransaction(async (client) => {
    const insertedChannel = await client.query(
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
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
      [
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
      ]
    );

    const channelDbId = insertedChannel.rows[0].id;

    await client.query(
      `INSERT INTO sponsors (channel_id, name, message, logo_url, sort_order)
       VALUES ($1,$2,$3,$4,0)`,
      [
        channelDbId,
        "Patrocinador Principal",
        "Apoya a quienes impulsan la comunidad Voranix.",
        ""
      ]
    );

    await client.query(
      `INSERT INTO commands (channel_id, trigger, type, title, message, duration_ms, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,0)`,
      [
        channelDbId,
        "!promo",
        "promo",
        "Promo Voranix",
        "Visita a nuestros patrocinadores oficiales y apoya la comunidad.",
        7000
      ]
    );

    return getChannel(safeChannelId);
  });
}

async function getChannel(channelId) {
  return mapChannelRow(await getChannelRowByChannelId(channelId));
}

async function getOrCreateChannel(channelId, ownerUserId = null) {
  const existing = await getChannel(channelId);
  if (existing) return existing;
  return insertDefaultChannel(channelId, ownerUserId);
}

async function assignChannelOwner(channelId, ownerUserId) {
  await query(
    "UPDATE channels SET owner_user_id = $1, updated_at = NOW() WHERE channel_id = $2",
    [ownerUserId, normalizeChannelId(channelId)]
  );
}

async function ensureOwnedChannelForUser(user) {
  const safeChannelId = normalizeChannelId(user.login);
  const existing = await getChannel(safeChannelId);

  if (!existing) {
    return insertDefaultChannel(safeChannelId, user.id);
  }

  if (!existing.ownerUserId) {
    await assignChannelOwner(safeChannelId, user.id);
  }

  return getChannel(safeChannelId);
}

async function getAllChannels() {
  const result = await query("SELECT * FROM channels ORDER BY channel_id ASC");
  return Promise.all(result.rows.map(mapChannelRow));
}

async function getAccessibleChannels(user) {
  if (!user) return [];
  if (user.role === "admin") {
    return getAllChannels();
  }

  const owned = await ensureOwnedChannelForUser(user);
  return owned ? [owned] : [];
}

async function getPublicChannelConfig(channelId) {
  const channel = await getOrCreateChannel(channelId);
  return {
    channelId: channel.channelId,
    twitchChannel: channel.twitchChannel,
    branding: channel.branding,
    sponsors: channel.sponsors
  };
}

async function findChannelByTwitchChannel(twitchChannel) {
  return mapChannelRow(await getChannelRowByTwitchChannel(twitchChannel));
}

function canManageChannel(user, channelId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return normalizeChannelId(user.login) === normalizeChannelId(channelId);
}

async function saveChannel(channelId, payload, options = {}) {
  const safeChannelId = normalizeChannelId(channelId);
  const existing = await getOrCreateChannel(safeChannelId, options.ownerUserId || null);
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

  await withTransaction(async (client) => {
    const channelRowResult = await client.query(
      "SELECT * FROM channels WHERE channel_id = $1",
      [safeChannelId]
    );
    const row = channelRowResult.rows[0];

    await client.query(
      `UPDATE channels
       SET twitch_channel = $1,
           owner_user_id = COALESCE($2, owner_user_id),
           community_name = $3,
           logo_text = $4,
           accent = $5,
           secondary_accent = $6,
           logo_url = $7,
           persistent_message = $8,
           ticker_text = $9,
           updated_at = NOW()
       WHERE id = $10`,
      [
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
      ]
    );

    await client.query("DELETE FROM commands WHERE channel_id = $1", [row.id]);
    for (const [index, command] of commands.entries()) {
      await client.query(
        `INSERT INTO commands (channel_id, trigger, type, title, message, duration_ms, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          row.id,
          command.trigger,
          command.type,
          command.title,
          command.message,
          command.durationMs,
          index
        ]
      );
    }

    if (options.allowSponsorEdit) {
      await client.query("DELETE FROM sponsors WHERE channel_id = $1", [row.id]);
      for (const [index, sponsor] of sponsors.entries()) {
        await client.query(
          `INSERT INTO sponsors (channel_id, name, message, logo_url, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.id, sponsor.name, sponsor.message, sponsor.logoUrl, index]
        );
      }
    }
  });

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
