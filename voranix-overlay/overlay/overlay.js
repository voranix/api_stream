const params = new URLSearchParams(window.location.search);
const channel = (params.get("channel") || "voranix").trim().toLowerCase();
const apiBase = (params.get("api") || window.location.origin).replace(/\/$/, "");

const socket = io(apiBase, {
  transports: ["websocket", "polling"],
  query: { channel }
});

const elements = {
  communityName: document.getElementById("community-name"),
  logoText: document.getElementById("logo-text"),
  logoMark: document.getElementById("logo-mark"),
  sponsorName: document.getElementById("sponsor-name"),
  persistentMessage: document.getElementById("persistent-message"),
  tickerText: document.getElementById("ticker-text"),
  eventStage: document.getElementById("event-stage"),
  eventType: document.getElementById("event-type"),
  eventTitle: document.getElementById("event-title"),
  eventMessage: document.getElementById("event-message")
};

const queue = [];
let showingEvent = false;

socket.on("showPromo", enqueueEvent);
socket.on("showEvent", enqueueEvent);
socket.on("showSponsor", enqueueEvent);
socket.on("showAlert", enqueueEvent);
socket.on("configUpdated", applyConfig);

async function bootstrap() {
  try {
    const response = await fetch(`${apiBase}/api/public/${encodeURIComponent(channel)}`);
    if (!response.ok) {
      throw new Error("No se pudo cargar la configuracion del overlay");
    }

    const config = await response.json();
    applyConfig(config);
  } catch (error) {
    console.error(error);
  }
}

function applyConfig(config) {
  const branding = config.branding || {};
  const sponsor = (config.sponsors || [])[0] || {};

  document.documentElement.style.setProperty("--accent", branding.accent || "#f97316");
  document.documentElement.style.setProperty(
    "--accent-secondary",
    branding.secondaryAccent || "#22c55e"
  );

  elements.communityName.textContent = branding.communityName || "Comunidad Voranix";
  elements.logoText.textContent = branding.logoText || "VORANIX";
  elements.logoMark.textContent = (branding.logoText || "V").slice(0, 1).toUpperCase();
  elements.sponsorName.textContent = sponsor.name || "Patrocinador Principal";
  elements.persistentMessage.textContent =
    sponsor.message || branding.persistentMessage || "";
  elements.tickerText.textContent =
    branding.tickerText || "Sigue las novedades de la comunidad en directo.";
}

function enqueueEvent(payload) {
  queue.push({
    type: payload.type || "promo",
    title: payload.title || "Voranix",
    message: payload.message || "",
    durationMs: payload.durationMs || 7000
  });

  if (!showingEvent) {
    showNextEvent();
  }
}

function showNextEvent() {
  const nextEvent = queue.shift();
  if (!nextEvent) {
    showingEvent = false;
    elements.eventStage.classList.remove("event-stage--visible");
    return;
  }

  showingEvent = true;
  elements.eventType.textContent = labelForType(nextEvent.type);
  elements.eventTitle.textContent = nextEvent.title;
  elements.eventMessage.textContent = nextEvent.message;
  elements.eventStage.classList.add("event-stage--visible");

  window.setTimeout(() => {
    elements.eventStage.classList.remove("event-stage--visible");
    window.setTimeout(showNextEvent, 350);
  }, nextEvent.durationMs);
}

function labelForType(type) {
  switch (type) {
    case "event":
      return "Evento";
    case "sponsor":
      return "Sponsor";
    case "alert":
      return "Alerta";
    default:
      return "Promo";
  }
}

bootstrap();
