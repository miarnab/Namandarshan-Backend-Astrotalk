import { Router } from "express";
import { randomUUID } from "node:crypto";
import Consultation from "../models/Consultation.js";
// import { getConsultations } from "../data/bookings.js";
import { findAstrologerByPublicId, getAstrologerForSession, readAuthSession } from "./auth.js";
import { createPaymentOrder, publicCheckoutOrder } from "../services/payments.js";

const router = Router();
const signalTypes = new Set(["ready", "offer", "answer", "candidate", "leave"]);

function createBookingId() {
  return `AST-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now()
    .toString()
    .slice(-4)}`;
}

function normalizeDuration(value) {
  const duration = Number.parseInt(value, 10);
  if (!Number.isFinite(duration)) return 5;
  return Math.min(60, Math.max(5, duration));
}

async function findAstrologer(req, astrologerId) {
  return findAstrologerByPublicId(req, astrologerId);
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  return toDate(value)?.toISOString() || value || null;
}

function sessionStartedAt(booking) {
  return toDate(booking.sessionStartedAt) || toDate(booking.paidAt) || toDate(booking.createdAt) || new Date();
}

function sessionEndsAt(booking) {
  const startedAt = sessionStartedAt(booking);
  const explicitEnd = toDate(booking.sessionEndsAt);

  if (explicitEnd) return explicitEnd;

  const durationMs = Math.max(1, Number(booking.durationMinutes) || 5) * 60 * 1000;
  return new Date(startedAt.getTime() + durationMs);
}

function sessionSnapshot(booking) {
  const startedAt = sessionStartedAt(booking);
  const endsAt = sessionEndsAt(booking);
  const remainingSeconds = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
  const status = booking.status === "completed" || remainingSeconds <= 0 ? "completed" : "active";

  return {
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    remainingSeconds,
    durationMinutes: Math.max(1, Number(booking.durationMinutes) || 5),
    status
  };
}

function toSerializableBooking(booking) {
  const item = typeof booking?.toObject === "function" ? booking.toObject() : booking;
  const session = sessionSnapshot(item);

  return {
    bookingId: item.bookingId,
    astrologerId: item.astrologerId,
    astrologerName: item.astrologerName,
    customerId: item.customerId,
    customerEmail: item.customerEmail,
    customerName: item.customerName,
    concern: item.concern,
    mode: item.mode,
    durationMinutes: item.durationMinutes,
    consultationFee: item.consultationFee,
    amountPaid: item.amountPaid,
    currency: item.currency,
    paymentStatus: item.paymentStatus,
    razorpayOrderId: item.razorpayOrderId,
    razorpayPaymentId: item.razorpayPaymentId,
    paidAt: toIso(item.paidAt),
    sessionStartedAt: toIso(item.sessionStartedAt) || session.startedAt,
    sessionEndsAt: toIso(item.sessionEndsAt) || session.endsAt,
    birthDate: item.birthDate,
    birthTime: item.birthTime,
    place: item.place,
    etaMinutes: item.etaMinutes,
    status: session.status,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt)
  };
}

function toSerializableMessage(message) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderRole: message.senderRole,
    senderName: message.senderName,
    body: message.body,
    createdAt: toIso(message.createdAt)
  };
}

function toSerializableSignal(signal) {
  return {
    id: signal.id,
    senderRole: signal.senderRole,
    type: signal.type,
    data: signal.data,
    createdAt: toIso(signal.createdAt)
  };
}

async function findConsultation(req, bookingId) {
  if (req.app.locals.mongoReady) {
    return Consultation.findOne({ bookingId });
  }

  // return getConsultations().find((item) => item.bookingId === bookingId) || null;
}

async function readParticipant(req, res, booking) {
  const session = readAuthSession(req);

  if (!session) {
    res.status(401).json({ message: "Sign in to join this consultation session." });
    return null;
  }

  const isCustomer =
    session.role === "user" && (!booking.customerEmail || booking.customerEmail === session.email);
  const astrologerProfile =
    session.role === "astrologer" ? await getAstrologerForSession(req, session) : null;
  const isAssignedAstrologer =
    session.role === "astrologer" && astrologerProfile?.id === booking.astrologerId;
  const isAstrologerDesk = session.role === "admin";

  if (!isCustomer && !isAssignedAstrologer && !isAstrologerDesk) {
    res.status(403).json({ message: "This consultation session belongs to another account." });
    return null;
  }

  return {
    ...session,
    participantRole: isCustomer ? "customer" : "astrologer"
  };
}

function ensureSessionFields(booking) {
  const startedAt = sessionStartedAt(booking);
  const endsAt = sessionEndsAt(booking);

  if (!booking.sessionStartedAt) booking.sessionStartedAt = startedAt;
  if (!booking.sessionEndsAt) booking.sessionEndsAt = endsAt;
  if (!Array.isArray(booking.chatMessages)) booking.chatMessages = [];
  if (!Array.isArray(booking.callSignals)) booking.callSignals = [];
}

async function saveConsultation(req, booking) {
  booking.updatedAt = new Date();

  if (req.app.locals.mongoReady && typeof booking.save === "function") {
    await booking.save();
  }

  return booking;
}

async function syncExpiredSession(req, booking) {
  ensureSessionFields(booking);

  const snapshot = sessionSnapshot(booking);
  if (snapshot.status === "completed" && booking.status !== "completed") {
    booking.status = "completed";
    await saveConsultation(req, booking);
  }

  return snapshot;
}

async function buildSessionPayload(req, booking, participant) {
  const session = await syncExpiredSession(req, booking);
  const item = typeof booking?.toObject === "function" ? booking.toObject() : booking;

  return {
    booking: toSerializableBooking(item),
    participant: {
      role: participant.participantRole,
      name: participant.name,
      email: participant.email
    },
    session,
    messages: (item.chatMessages || []).map(toSerializableMessage)
  };
}

router.post("/", async (req, res, next) => {
  try {
    const session = readAuthSession(req);

    if (!session) {
      return res.status(401).json({ message: "Sign in to book a chat or call with an astrologer." });
    }

    if (session.role !== "user") {
      return res.status(403).json({ message: "Only customer accounts can book consultations." });
    }

    const { astrologerId, name, concern, mode, birthDate, birthTime, place, durationMinutes } =
      req.body;

    if (!astrologerId || !name || !concern || !mode) {
      return res.status(400).json({
        message: "Astrologer, name, concern, and consultation mode are required."
      });
    }

    const astrologer = await findAstrologer(req, astrologerId);

    if (!astrologer) {
      return res.status(404).json({ message: "Astrologer not found." });
    }

    if (!astrologer.modes.includes(mode)) {
      return res.status(400).json({ message: `${astrologer.name} is not available for ${mode}.` });
    }

    const etaMinutes = astrologer.status === "online" ? 2 : astrologer.status === "busy" ? 8 : 25;
    const duration = normalizeDuration(durationMinutes);
    const consultationFee = Number(astrologer.pricePerMinute || 0) * duration;

    if (consultationFee <= 0) {
      return res.status(400).json({ message: "Unable to calculate consultation fees." });
    }

    const bookingDraft = {
      bookingId: createBookingId(),
      astrologerId,
      astrologerName: astrologer.name,
      customerId: session.id,
      customerEmail: session.email,
      customerName: name,
      concern,
      mode,
      durationMinutes: duration,
      consultationFee,
      amountPaid: consultationFee,
      currency: process.env.RAZORPAY_CURRENCY || "INR",
      birthDate,
      birthTime,
      place,
      etaMinutes,
      status: "confirmed"
    };

    const paymentOrder = await createPaymentOrder(req, {
      session,
      purpose: "consultation",
      amount: consultationFee,
      receiptPrefix: "consult",
      notes: {
        purpose: "consultation",
        bookingId: bookingDraft.bookingId,
        astrologerId,
        mode
      },
      consultation: bookingDraft
    });

    res.status(201).json({
      message: "Payment order created. Complete payment to confirm the consultation.",
      ...publicCheckoutOrder(paymentOrder),
      booking: bookingDraft
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:bookingId/session", async (req, res, next) => {
  try {
    const booking = await findConsultation(req, req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Consultation booking was not found." });
    }

    const participant = await readParticipant(req, res, booking);
    if (!participant) return;

    res.json(await buildSessionPayload(req, booking, participant));
  } catch (error) {
    next(error);
  }
});

router.post("/:bookingId/messages", async (req, res, next) => {
  try {
    const booking = await findConsultation(req, req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Consultation booking was not found." });
    }

    const participant = await readParticipant(req, res, booking);
    if (!participant) return;

    if (booking.mode !== "chat") {
      return res.status(400).json({ message: "Messages are only available for chat sessions." });
    }

    const session = await syncExpiredSession(req, booking);
    if (session.status === "completed") {
      return res.status(403).json({ message: "This chat session has ended." });
    }

    const body = String(req.body.body || "").trim();

    if (!body) {
      return res.status(400).json({ message: "Enter a message to send." });
    }

    if (body.length > 1000) {
      return res.status(400).json({ message: "Messages must be 1000 characters or fewer." });
    }

    const message = {
      id: randomUUID(),
      senderId: participant.id,
      senderRole: participant.participantRole,
      senderName: participant.name,
      body,
      createdAt: new Date()
    };

    booking.chatMessages = [...(booking.chatMessages || []), message].slice(-150);
    await saveConsultation(req, booking);

    res.status(201).json(await buildSessionPayload(req, booking, participant));
  } catch (error) {
    next(error);
  }
});

router.get("/:bookingId/signals", async (req, res, next) => {
  try {
    const booking = await findConsultation(req, req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Consultation booking was not found." });
    }

    const participant = await readParticipant(req, res, booking);
    if (!participant) return;

    if (booking.mode !== "call") {
      return res.status(400).json({ message: "Call signaling is only available for call sessions." });
    }

    const session = await syncExpiredSession(req, booking);
    const item = typeof booking?.toObject === "function" ? booking.toObject() : booking;

    res.json({
      session,
      signals: (item.callSignals || []).map(toSerializableSignal)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:bookingId/signals", async (req, res, next) => {
  try {
    const booking = await findConsultation(req, req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Consultation booking was not found." });
    }

    const participant = await readParticipant(req, res, booking);
    if (!participant) return;

    if (booking.mode !== "call") {
      return res.status(400).json({ message: "Call signaling is only available for call sessions." });
    }

    const session = await syncExpiredSession(req, booking);
    if (session.status === "completed") {
      return res.status(403).json({ message: "This call session has ended." });
    }

    const type = String(req.body.type || "").trim();

    if (!signalTypes.has(type)) {
      return res.status(400).json({ message: "Unsupported call signal type." });
    }

    const signal = {
      id: randomUUID(),
      senderRole: participant.participantRole,
      type,
      data: req.body.data || null,
      createdAt: new Date()
    };

    booking.callSignals = [...(booking.callSignals || []), signal].slice(-200);
    await saveConsultation(req, booking);

    res.status(201).json({
      signal: toSerializableSignal(signal),
      session: sessionSnapshot(booking)
    });
  } catch (error) {
    next(error);
  }
});

export default router;