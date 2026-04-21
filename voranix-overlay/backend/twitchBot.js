const tmi = require("tmi.js");
const { sendOverlayEvent } = require("./socket");
const {
  getAllChannels,
  findChannelByTwitchChannel,
  normalizeChannelId
} = require("./services/channelStore");

if (
  !process.env.TWITCH_BOT_USERNAME ||
  !process.env.TWITCH_OAUTH ||
  !process.env.TWITCH_CHANNEL
) {
  console.log("Bot de Twitch no configurado. Falta revisar el archivo .env.");
  return;
}

const fallbackChannels = process.env.TWITCH_CHANNEL.split(",")
  .map((channelName) => normalizeChannelId(channelName))
  .filter(Boolean);

const configuredChannels = getAllChannels()
  .map((channel) => normalizeChannelId(channel.twitchChannel))
  .filter(Boolean);

const channels = Array.from(new Set([...fallbackChannels, ...configuredChannels]));

const client = new tmi.Client({
  options: { debug: true },
  connection: {
    reconnect: true,
    secure: true
  },
  identity: {
    username: process.env.TWITCH_BOT_USERNAME,
    password: process.env.TWITCH_OAUTH
  },
  channels
});

client.connect().catch((error) => {
  console.error("No se pudo conectar el bot de Twitch:", error.message);
});

client.on("message", (channelName, tags, message, self) => {
  if (self) return;

  const normalizedTwitchChannel = normalizeChannelId(channelName);
  const channel = findChannelByTwitchChannel(normalizedTwitchChannel);
  if (!channel) return;

  const normalizedMessage = String(message || "").trim().toLowerCase();
  const command = (channel.commands || []).find(
    (item) => item.trigger.toLowerCase() === normalizedMessage
  );

  if (!command) return;

  const eventType = command.type || "promo";
  const overlayEvent = `show${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`;

  sendOverlayEvent(channel.channelId, overlayEvent, {
    title: command.title,
    message: command.message,
    type: eventType,
    durationMs: command.durationMs,
    author: tags["display-name"] || tags.username || ""
  });
});
