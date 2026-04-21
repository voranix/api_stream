const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const setupSocket = require("./socket");
const authRouter = require("./routes/auth");
const channelsRouter = require("./routes/channels");
const { sendOverlayEvent } = require("./socket");
const {
  getPublicChannelConfig,
  normalizeChannelId
} = require("./services/channelStore");
const { attachUser } = require("./middleware/auth");

require("./twitchBot");

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      callback(null, origin || true);
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(attachUser);

const server = http.createServer(app);
setupSocket(server);

app.use("/overlay", express.static(path.join(__dirname, "..", "overlay")));
app.use("/api/auth", authRouter);
app.use("/api/channels", channelsRouter);

app.get("/", (req, res) => {
  res.json({
    name: "Voranix Overlay API",
    status: "ok",
    overlayExample: "/overlay/?channel=voranix",
    dashboardHint: "Levanta dashboard-angular en local o sube el build a Render.",
    auth: "/api/auth/twitch/start"
  });
});

app.get("/api/public/:channelId", (req, res) => {
  res.json(getPublicChannelConfig(req.params.channelId));
});

app.get("/api/test/:channelId", (req, res) => {
  const channelId = normalizeChannelId(req.params.channelId);
  sendOverlayEvent(channelId, "showPromo", {
    title: "Prueba manual",
    message: "Promo enviada desde la API para validar el overlay.",
    type: "promo",
    durationMs: 7000
  });

  res.json({ ok: true, channelId });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Voranix Overlay API running on port ${PORT}`);
});
