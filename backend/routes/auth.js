import { Router } from "express";
import { randomUUID } from "node:crypto";
import Astrologer from "../models/Astrologer.js";
import User from "../models/User.js";
import { createAuthToken, hashPassword, verifyAuthToken, verifyPassword } from "../utils/security.js";

const router = Router();

const roleProfiles = {
  user: {
    role: "user",
    dashboard: "Customer dashboard",
    nextStep: "Your wallet, bookings, and consultation history are ready."
  },
  admin: {
    role: "admin",
    dashboard: "Admin console",
    nextStep: "Astrologer approvals, bookings, and service controls are ready."
  },
  astrologer: {
    role: "astrologer",
    dashboard: "Astrologer dashboard",
    nextStep: "Your profile, availability, and consultation queue are ready."
  }
};

const memoryAccounts = new Map();
const memoryAstrologers = new Map();
const defaultWallet = {
  balance: 0,
  rewards: 0,
  freeMinutes: 0,
  spendThisMonth: 0
};
const emptyCustomerProfile = {
  birthDate: "",
  birthTime: "",
  place: "",
  concern: "",
  gender: "",
  preferredLanguage: ""
};
const accentPalette = ["#f4b400", "#188b8b", "#e85d75", "#5661d9", "#2d9b68", "#d76a03"];

function normalize(value = "") {
  return String(value).trim();
}

function normalizeEmail(value = "") {
  return normalize(value).toLowerCase();
}

function normalizeRole(value = "") {
  const role = normalize(value).toLowerCase();
  if (role === "customer") return "user";
  if (role === "expert") return "astrologer";
  return role;
}

function getAdminCode() {
  return normalize(process.env.ADMIN_REGISTRATION_CODE || process.env.ADMIN_CODE || "ADMIN-2026").toUpperCase();
}

function isValidEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function isValidAdminCode(value) {
  return normalize(value).toUpperCase() === getAdminCode();
}

function isValidPhone(value) {
  return normalize(value).replace(/\D/g, "").length >= 7;
}

function toAccountObject(account) {
  return typeof account?.toObject === "function" ? account.toObject() : account;
}

function accountId(account) {
  const item = toAccountObject(account);
  return item?.id || item?._id?.toString();
}

function walletSnapshot(account) {
  return {
    ...defaultWallet,
    ...(toAccountObject(account)?.wallet || {})
  };
}

function profileSnapshot(account) {
  return {
    ...emptyCustomerProfile,
    ...(toAccountObject(account)?.profile || {})
  };
}

function splitList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,\n]/);
  return [...new Set(values.map((entry) => normalize(entry)).filter(Boolean))];
}

function readModes(value) {
  const values = Array.isArray(value) ? value : splitList(value);
  return [...new Set(values.map((entry) => normalize(entry).toLowerCase()).filter((entry) => ["chat", "call"].includes(entry)))];
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(normalize(value));
}

function colorFromName(name) {
  const text = normalize(name);
  const index = [...text].reduce((total, char) => total + char.charCodeAt(0), 0) % accentPalette.length;
  return accentPalette[index];
}

function createAstrologerId(name) {
  const slug =
    normalize(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "astrologer";

  return `astro-${slug}-${randomUUID().slice(0, 8)}`;
}

function astrologerSnapshot(profile) {
  if (!profile) return null;

  const item = typeof profile?.toObject === "function" ? profile.toObject() : profile;

  return {
    id: item.id,
    userId: item.userId,
    name: item.name,
    email: item.email,
    phone: item.phone,
    title: item.title,
    bio: item.bio,
    city: item.city,
    specialties: item.specialties || [],
    languages: item.languages || [],
    experience: Number(item.experience) || 0,
    rating: Number(item.rating) || 0,
    orders: Number(item.orders) || 0,
    pricePerMinute: Number(item.pricePerMinute) || 0,
    modes: item.modes || [],
    status: item.status || "online",
    responseTime: item.responseTime,
    availability: item.availability,
    education: item.education,
    certifications: item.certifications,
    accent: item.accent || colorFromName(item.name),
    createdAt: item.createdAt?.toISOString?.() || item.createdAt || null,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt || null
  };
}

function readAstrologerPayload(payload = {}, account = {}) {
  const source =
    payload.astrologer && typeof payload.astrologer === "object"
      ? { ...payload, ...payload.astrologer }
      : payload;
  const name = normalize(source.name || account.name);
  const accent = normalize(source.accent);

  return {
    name,
    email: normalizeEmail(source.email || account.email),
    phone: normalize(source.phone || account.phone),
    title: normalize(source.title),
    bio: normalize(source.bio),
    city: normalize(source.city),
    specialties: splitList(source.specialties),
    languages: splitList(source.languages),
    experience: readNumber(source.experience),
    pricePerMinute: readNumber(source.pricePerMinute),
    modes: readModes(source.modes),
    status: normalize(source.status || "online").toLowerCase(),
    responseTime: normalize(source.responseTime),
    availability: normalize(source.availability),
    education: normalize(source.education),
    certifications: normalize(source.certifications),
    accent: isHexColor(accent) ? accent : colorFromName(name)
  };
}

function validateAstrologerProfile(profile, res) {
  if (!profile.title || profile.title.length < 3) {
    res.status(400).json({ message: "Enter a professional astrologer title." });
    return false;
  }

  if (!profile.bio || profile.bio.length < 20) {
    res.status(400).json({ message: "Enter a profile bio of at least 20 characters." });
    return false;
  }

  if (!profile.city) {
    res.status(400).json({ message: "Enter the astrologer's city." });
    return false;
  }

  if (profile.specialties.length === 0) {
    res.status(400).json({ message: "Enter at least one specialty." });
    return false;
  }

  if (profile.languages.length === 0) {
    res.status(400).json({ message: "Enter at least one language." });
    return false;
  }

  if (!Number.isFinite(profile.experience) || profile.experience < 0 || profile.experience > 80) {
    res.status(400).json({ message: "Experience must be between 0 and 80 years." });
    return false;
  }

  if (!Number.isFinite(profile.pricePerMinute) || profile.pricePerMinute < 1 || profile.pricePerMinute > 10000) {
    res.status(400).json({ message: "Price per minute must be between Rs 1 and Rs 10,000." });
    return false;
  }

  if (profile.modes.length === 0) {
    res.status(400).json({ message: "Choose chat, call, or both consultation modes." });
    return false;
  }

  if (!["online", "busy", "offline"].includes(profile.status)) {
    res.status(400).json({ message: "Choose a valid availability status." });
    return false;
  }

  if (!profile.responseTime) {
    res.status(400).json({ message: "Enter the usual response time." });
    return false;
  }

  if (!profile.availability) {
    res.status(400).json({ message: "Enter consultation availability hours." });
    return false;
  }

  if (!profile.education) {
    res.status(400).json({ message: "Enter education or training details." });
    return false;
  }

  if (!profile.certifications) {
    res.status(400).json({ message: "Enter certification or verification details." });
    return false;
  }

  return true;
}

async function findAccountBySession(req, session) {
  if (!session?.email) return null;

  if (req.app.locals.mongoReady) {
    return User.findOne({ email: session.email });
  }

  return memoryAccounts.get(session.email) || null;
}

async function updateWalletForSession(req, session, updater) {
  const account = await findAccountBySession(req, session);

  if (!account || account.role !== "user") return null;

  const nextWallet = updater(walletSnapshot(account));

  if (req.app.locals.mongoReady) {
    account.wallet = nextWallet;
    await account.save();
    return walletSnapshot(account);
  }

  account.wallet = nextWallet;
  account.updatedAt = new Date();
  memoryAccounts.set(account.email, account);
  return walletSnapshot(account);
}

async function findAstrologerForAccount(req, account) {
  const item = toAccountObject(account);
  const id = accountId(item);

  if (!id || item.role !== "astrologer") return null;

  if (req.app.locals.mongoReady) {
    return Astrologer.findOne({
      $or: [{ userId: id }, { email: item.email }]
    });
  }

  return memoryAstrologers.get(id) || null;
}

async function publicUser(req, account) {
  const item = toAccountObject(account);
  const role = roleProfiles[item.role];
  const user = {
    id: accountId(item),
    name: item.name,
    email: item.email,
    phone: item.phone,
    role: item.role,
    dashboard: role.dashboard
  };

  if (item.role === "user") {
    user.profile = profileSnapshot(item);
  }

  if (item.role === "astrologer") {
    user.astrologer = astrologerSnapshot(await findAstrologerForAccount(req, item));
  }

  return user;
}

async function createSession(req, account, message) {
  const user = await publicUser(req, account);
  const profile = roleProfiles[user.role];

  return {
    token: createAuthToken({
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name
    }),
    user,
    message,
    nextStep: profile.nextStep
  };
}

async function findAccount(req, email) {
  if (req.app.locals.mongoReady) {
    return User.findOne({ email });
  }

  return memoryAccounts.get(email) || null;
}

async function createAccount(req, account) {
  const normalizedAccount = {
    ...account,
    email: normalizeEmail(account.email),
    profile: account.role === "user" ? account.profile || { ...emptyCustomerProfile } : undefined,
    wallet: account.role === "user" ? { ...defaultWallet } : undefined
  };

  if (req.app.locals.mongoReady) {
    return User.create(normalizedAccount);
  }

  const now = new Date();
  const storedAccount = {
    ...normalizedAccount,
    id: `${normalizedAccount.role}-${randomUUID()}`,
    createdAt: now,
    updatedAt: now
  };

  memoryAccounts.set(storedAccount.email, storedAccount);
  return storedAccount;
}

async function createOrUpdateAstrologerProfile(req, account, payload) {
  const item = toAccountObject(account);
  const id = accountId(item);
  const profile = {
    ...payload,
    email: item.email,
    phone: item.phone,
    name: item.name,
    userId: id
  };

  if (req.app.locals.mongoReady) {
    const existing = await Astrologer.findOne({
      $or: [{ userId: id }, { email: item.email }]
    });

    if (existing) {
      Object.assign(existing, profile);
      await existing.save();
      return existing;
    }

    return Astrologer.create({
      ...profile,
      id: createAstrologerId(item.name),
      rating: 0,
      orders: 0
    });
  }

  const existing = memoryAstrologers.get(id);
  const now = new Date();
  const storedProfile = {
    ...(existing || {}),
    ...profile,
    id: existing?.id || createAstrologerId(item.name),
    rating: existing?.rating || 0,
    orders: existing?.orders || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  memoryAstrologers.set(id, storedProfile);
  return storedProfile;
}

function validateRole(role, res, action) {
  if (!["user", "admin", "astrologer"].includes(role)) {
    res.status(400).json({ message: `Choose customer, astrologer, or admin ${action}.` });
    return false;
  }

  return true;
}

function readProfilePayload(payload = {}) {
  const source =
    payload.profile && typeof payload.profile === "object"
      ? { ...payload, ...payload.profile }
      : payload;

  return {
    birthDate: normalize(source.birthDate),
    birthTime: normalize(source.birthTime),
    place: normalize(source.place),
    concern: normalize(source.concern),
    gender: normalize(source.gender),
    preferredLanguage: normalize(source.preferredLanguage)
  };
}

async function requireProfileAccount(req, res) {
  const session = readAuthSession(req);

  if (!session) {
    res.status(401).json({ message: "Sign in to manage your profile." });
    return null;
  }

  if (!["user", "astrologer"].includes(session.role)) {
    res.status(403).json({ message: "This account does not have an editable profile." });
    return null;
  }

  const account = await findAccountBySession(req, session);

  if (!account) {
    res.status(404).json({ message: "Account not found." });
    return null;
  }

  return { account, session };
}

export function readAuthSession(req) {
  const header = req.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return verifyAuthToken(token);
}

export async function listAstrologerProfiles(req) {
  if (req.app.locals.mongoReady) {
    const rows = await Astrologer.find().sort({ rating: -1, createdAt: -1 }).lean();
    return rows.map(astrologerSnapshot);
  }

  return Array.from(memoryAstrologers.values()).map(astrologerSnapshot);
}

export async function findAstrologerByPublicId(req, astrologerId) {
  const id = normalize(astrologerId);
  if (!id) return null;

  if (req.app.locals.mongoReady) {
    return Astrologer.findOne({ id }).lean();
  }

  return Array.from(memoryAstrologers.values()).find((item) => item.id === id) || null;
}

export async function getAstrologerForSession(req, session) {
  if (session?.role !== "astrologer") return null;

  if (req.app.locals.mongoReady) {
    return Astrologer.findOne({
      $or: [{ userId: session.id }, { email: session.email }]
    }).lean();
  }

  return memoryAstrologers.get(session.id) || null;
}

export async function getWalletForSession(req, session) {
  const account = await findAccountBySession(req, session);

  if (!account || account.role !== "user") return { ...defaultWallet };

  return walletSnapshot(account);
}

export async function creditWalletForSession(req, session, amount) {
  const creditAmount = Math.max(0, Number(amount) || 0);

  return updateWalletForSession(req, session, (wallet) => ({
    ...wallet,
    balance: wallet.balance + creditAmount
  }));
}

export async function recordWalletSpendForSession(req, session, amount) {
  const spendAmount = Math.max(0, Number(amount) || 0);

  return updateWalletForSession(req, session, (wallet) => ({
    ...wallet,
    spendThisMonth: wallet.spendThisMonth + spendAmount
  }));
}

export async function register(req, res, next) {
  try {
    const role = normalizeRole(req.body.role);
    const name = normalize(req.body.name);
    const email = normalizeEmail(req.body.email);
    const phone = normalize(req.body.phone);
    const password = normalize(req.body.password);
    const confirmPassword = normalize(req.body.confirmPassword);
    const adminCode = normalize(req.body.adminCode);

    if (!validateRole(role, res, "registration")) return;

    if (!name || name.length < 2) {
      return res.status(400).json({ message: "Enter the account holder name." });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({ message: "Enter a valid phone number." });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    if (!confirmPassword || password !== confirmPassword) {
      return res.status(400).json({ message: "Confirm password must match the password." });
    }

    if (role === "admin" && !isValidAdminCode(adminCode)) {
      return res.status(401).json({ message: "Enter the correct admin registration code." });
    }

    const astrologerProfile =
      role === "astrologer" ? readAstrologerPayload(req.body, { name, email, phone }) : null;

    if (role === "astrologer" && !validateAstrologerProfile(astrologerProfile, res)) return;

    const existing = await findAccount(req, email);

    if (existing) {
      return res.status(409).json({ message: "An account already exists with this email." });
    }

    const account = await createAccount(req, {
      name,
      email,
      phone,
      role,
      adminCodeVerified: role === "admin",
      passwordHash: hashPassword(password)
    });

    if (role === "astrologer") {
      await createOrUpdateAstrologerProfile(req, account, astrologerProfile);
    }

    const label = role === "admin" ? "Admin" : role === "astrologer" ? "Astrologer" : "Customer";

    res.status(201).json(await createSession(req, account, `${label} account created.`));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "An account already exists with this email." });
    }

    next(error);
  }
}

export async function signIn(req, res, next) {
  try {
    const role = normalizeRole(req.body.role);
    const email = normalizeEmail(req.body.email);
    const password = normalize(req.body.password);
    const adminCode = normalize(req.body.adminCode);

    if (!validateRole(role, res, "sign in")) return;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    if (role === "admin" && !isValidAdminCode(adminCode)) {
      return res.status(401).json({ message: "Enter the correct admin access code." });
    }

    const account = await findAccount(req, email);

    if (!account || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    if (account.role !== role) {
      const label =
        account.role === "admin" ? "admin" : account.role === "astrologer" ? "astrologer" : "customer";
      return res.status(403).json({ message: `This email is registered as a ${label} account.` });
    }

    const profile = roleProfiles[role];
    res.json(await createSession(req, account, `${profile.dashboard} unlocked.`));
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req, res, next) {
  try {
    const result = await requireProfileAccount(req, res);
    if (!result) return;

    res.json({
      user: await publicUser(req, result.account)
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const result = await requireProfileAccount(req, res);
    if (!result) return;

    const { account, session } = result;
    const name = normalize(req.body.name || account.name);
    const phone = normalize(req.body.phone || account.phone);

    if (!name || name.length < 2) {
      return res.status(400).json({ message: "Enter the account holder name." });
    }

    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({ message: "Enter a valid phone number." });
    }

    account.name = name;
    account.phone = phone;
    account.updatedAt = new Date();

    if (session.role === "user") {
      account.profile = readProfilePayload(req.body);
    }

    if (session.role === "astrologer") {
      const astrologerProfile = readAstrologerPayload(req.body, {
        name,
        email: account.email,
        phone
      });

      if (!validateAstrologerProfile(astrologerProfile, res)) return;

      if (req.app.locals.mongoReady) {
        await account.save();
      } else {
        memoryAccounts.set(account.email, account);
      }

      await createOrUpdateAstrologerProfile(req, account, astrologerProfile);
      return res.json(await createSession(req, account, "Astrologer profile saved."));
    }

    if (req.app.locals.mongoReady) {
      await account.save();
    } else {
      memoryAccounts.set(account.email, account);
    }

    res.json(await createSession(req, account, "Customer profile saved."));
  } catch (error) {
    next(error);
  }
}

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.post("/register", register);
router.post("/signin", signIn);

export default router;