const {
  getSessionTokenFromRequest,
  getUserBySessionToken
} = require("../services/authService");

function attachUser(request, response, next) {
  const token = getSessionTokenFromRequest(request);
  request.user = getUserBySessionToken(token);
  request.sessionToken = token;
  next();
}

function requireAuth(request, response, next) {
  if (!request.user) {
    return response.status(401).json({ error: "authentication_required" });
  }

  return next();
}

module.exports = {
  attachUser,
  requireAuth
};
