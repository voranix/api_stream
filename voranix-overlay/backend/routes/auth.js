const express = require("express");
const {
  clearSessionCookie,
  clearStateCookie,
  createSession,
  createState,
  deleteSession,
  getStateFromRequest,
  setSessionCookie,
  setStateCookie,
  upsertUserFromTwitch
} = require("../services/authService");
const { getAccessibleChannels } = require("../services/channelStore");

const router = express.Router();

function requiredAuthEnv() {
  return (
    process.env.TWITCH_CLIENT_ID &&
    process.env.TWITCH_CLIENT_SECRET &&
    process.env.TWITCH_REDIRECT_URI
  );
}

router.get("/me", (request, response) => {
  if (!request.user) {
    return response.json({ authenticated: false });
  }

  return response.json({
    authenticated: true,
    user: {
      id: request.user.id,
      login: request.user.login,
      displayName: request.user.display_name,
      email: request.user.email,
      profileImageUrl: request.user.profile_image_url,
      role: request.user.role
    },
    channels: getAccessibleChannels(request.user)
  });
});

router.get("/twitch/start", (request, response) => {
  if (!requiredAuthEnv()) {
    return response.status(500).json({ error: "missing_twitch_oauth_env" });
  }

  const state = createState();
  setStateCookie(response, state, request);

  const authorizeUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", process.env.TWITCH_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", "user:read:email");
  authorizeUrl.searchParams.set("state", state);

  return response.redirect(authorizeUrl.toString());
});

router.get("/twitch/callback", async (request, response) => {
  if (!requiredAuthEnv()) {
    return response.status(500).send("Faltan variables OAuth de Twitch.");
  }

  const expectedState = getStateFromRequest(request);
  const receivedState = String(request.query.state || "");
  const code = String(request.query.code || "");

  if (!code || !expectedState || expectedState !== receivedState) {
    return response.status(400).send("Estado OAuth invalido.");
  }

  try {
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.TWITCH_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      throw new Error("No se pudo intercambiar el code por token");
    }

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID
      }
    });

    if (!userResponse.ok) {
      throw new Error("No se pudo leer el perfil de Twitch");
    }

    const userData = await userResponse.json();
    const twitchProfile = userData.data && userData.data[0];

    if (!twitchProfile) {
      throw new Error("Twitch no devolvio perfil de usuario");
    }

    const user = upsertUserFromTwitch(twitchProfile);
    const sessionToken = createSession(user.id);

    clearStateCookie(response, request);
    setSessionCookie(response, sessionToken, request);

    const redirectTarget = process.env.DASHBOARD_URL || "http://localhost:4200";
    return response.redirect(redirectTarget);
  } catch (error) {
    console.error(error);
    return response.status(500).send("Fallo el login con Twitch.");
  }
});

router.post("/logout", (request, response) => {
  if (request.sessionToken) {
    deleteSession(request.sessionToken);
  }

  clearStateCookie(response, request);
  clearSessionCookie(response, request);
  return response.json({ ok: true });
});

module.exports = router;
