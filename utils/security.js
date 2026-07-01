import crypto from "node:crypto";

function getTokenSecret() {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET || "namandarshan-astrotalk-local-dev-secret";
}

function sign(value) {
  return crypto.createHmac("sha256", getTokenSecret()).update(value).digest("base64url");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password, storedHash = "") {
  const [salt, key] = String(storedHash).split(":");

  if (!salt || !key) return false;

  const candidate = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(key, "hex");

  if (candidate.length !== known.length) return false;

  return crypto.timingSafeEqual(candidate, known);
}

export function createAuthToken(payload) {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Date.now()
    })
  ).toString("base64url");

  return `${body}.${sign(body)}`;
}

export function verifyAuthToken(token = "") {
  const [body, signature] = String(token).split(".");

  if (!body || !signature || sign(body) !== signature) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}