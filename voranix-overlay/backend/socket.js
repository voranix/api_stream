const { Server } = require("socket.io");
const { normalizeChannelId } = require("./services/channelStore");

let io;

function getRoomName(channelId) {
  return `channel:${normalizeChannelId(channelId)}`;
}

function setupSocket(server) {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    const channelId = normalizeChannelId(socket.handshake.query.channel || "voranix");
    socket.join(getRoomName(channelId));
    socket.emit("joinedChannel", { channelId });
    console.log(`Cliente ${socket.id} conectado al canal ${channelId}`);
  });
}

function sendOverlayEvent(channelId, event, data) {
  if (io) {
    io.to(getRoomName(channelId)).emit(event, data);
  }
}

module.exports = setupSocket;
module.exports.sendOverlayEvent = sendOverlayEvent;
