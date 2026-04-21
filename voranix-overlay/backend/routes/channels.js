const express = require("express");
const {
  getAccessibleChannels,
  getChannel,
  saveChannel,
  getPublicChannelConfig,
  normalizeChannelId,
  canManageChannel
} = require("../services/channelStore");
const { sendOverlayEvent } = require("../socket");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "authentication_required" });
  }

  return res.json({ channels: await getAccessibleChannels(req.user) });
});

router.get("/:channelId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "authentication_required" });
  }

  if (!canManageChannel(req.user, req.params.channelId)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const channel = await getChannel(req.params.channelId);
  if (!channel) {
    return res.status(404).json({ error: "channel_not_found" });
  }

  return res.json(channel);
});

router.put("/:channelId", requireAuth, async (req, res) => {
  if (!canManageChannel(req.user, req.params.channelId)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const channel = await saveChannel(req.params.channelId, req.body || {}, {
    allowSponsorEdit: req.user.role === "admin",
    ownerUserId: req.user.role === "admin" ? undefined : req.user.id
  });
  sendOverlayEvent(
    channel.channelId,
    "configUpdated",
    await getPublicChannelConfig(channel.channelId)
  );
  res.json(channel);
});

router.get("/:channelId/public", async (req, res) => {
  res.json(await getPublicChannelConfig(req.params.channelId));
});

router.post("/:channelId/trigger", requireAuth, async (req, res) => {
  if (!canManageChannel(req.user, req.params.channelId)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const channelId = normalizeChannelId(req.params.channelId);
  const payload = req.body || {};
  const eventName = String(payload.type || "promo").trim().toLowerCase();
  const overlayEvent = `show${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;

  const eventPayload = {
    title: String(payload.title || "Voranix").trim(),
    message: String(payload.message || "").trim(),
    type: eventName,
    durationMs: Number(payload.durationMs) > 0 ? Number(payload.durationMs) : 7000,
    sponsorName: String(payload.sponsorName || "").trim()
  };

  sendOverlayEvent(channelId, overlayEvent, eventPayload);
  res.json({ ok: true, channelId, event: overlayEvent, payload: eventPayload });
});

module.exports = router;
