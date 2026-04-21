const crypto = require("crypto");
const { db } = require("./db");
const { ensureOwnedChannelForUser } = require("./channelStore");

const SESSION_COOKIE = "voranix_session";
const STATE_COOKIE = "voranix_oauth_state";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) return accumulator;
      const key = entry.slice(0, separatorIndex);
      const value = entry.slice(separatorIndex + 1);
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.sameSite) attributes.push(`SameSite=${options.sameSite}`);
  if (options.path) attributes.push(`Path=${options.path}`);
  if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`);
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

function getCookieOptions(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const secure = process.env.NODE_ENV === "production" || forwardedProto === "https";
  return {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure
  };
}

function setStateCookie(response, state, request) {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(STATE_COOKIE, state, {
      ...getCookieOptions(request),
      maxAge: 600
    })
  );
}

function clearStateCookie(response, request) {
  response.append(
    "Set-Cookie",
    serializeCookie(STATE_COOKIE, "", {
      ...getCookieOptions(request),
      maxAge: 0
    })
  );
}

function setSessionCookie(response, token, request) {
  response.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, token, {
      ...getCookieOptions(request),
      maxAge: SESSION_TTL_MS / 1000
    })
  );
}

function clearSessionCookie(response, request) {
  response.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, "", {
      ...getCookieOptions(request),
      maxAge: 0
    })
  );
}

function getStateFromRequest(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return cookies[STATE_COOKIE] || "";
}

function getSessionTokenFromRequest(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return cookies[SESSION_COOKIE] || "";
}

function createState() {
  return crypto.randomBytes(24).toString("hex");
}

function resolveRole(login) {
  const adminLogins = String(process.env.ADMIN_TWITCH_LOGINS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return adminLogins.includes(String(login || "").toLowerCase()) ? "admin" : "streamer";
}

function upsertUserFromTwitch(profile) {
  const role = resolveRole(profile.login);
  const existing = db.prepare("SELECT * FROM users WHERE twitch_id = ?").get(profile.id);

  if (existing) {
    db.prepare(
      `UPDATE users
       SET login = ?,
           display_name = ?,
           email = ?,
           profile_image_url = ?,
           role = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      profile.login,
      profile.display_name,
      profile.email || "",
      profile.profile_image_url || "",
      role,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO users (twitch_id, login, display_name, email, profile_image_url, role)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      profile.id,
      profile.login,
      profile.display_name,
      profile.email || "",
      profile.profile_image_url || "",
      role
    );
  }

  const user = db.prepare("SELECT * FROM users WHERE twitch_id = ?").get(profile.id);

  if (user.role !== "admin") {
    ensureOwnedChannelForUser(user);
  }

  return user;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt
  );

  return token;
}

function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getUserBySessionToken(token) {
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT users.*
       FROM sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP`
    )
    .get(token);

  return row || null;
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  setStateCookie,
  clearStateCookie,
  setSessionCookie,
  clearSessionCookie,
  getStateFromRequest,
  getSessionTokenFromRequest,
  createState,
  upsertUserFromTwitch,
  createSession,
  deleteSession,
  getUserBySessionToken
};
