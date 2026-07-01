import { Router } from "express";
import Consultation from "../models/Consultation.js";
// import { getConsultations } from "../data/bookings.js";
// import { services } from "../data/seed.js";
import {
  getAstrologerForSession,
  getWalletForSession,
  listAstrologerProfiles,
  readAuthSession
} from "./auth.js";

const router = Router();

function requireRole(req, res, role) {
  const session = readAuthSession(req);

  if (!session) {
    res.status(401).json({ message: "Sign in to open this panel." });
    return null;
  }

  if (session.role !== role) {
    res.status(403).json({ message: `This panel is only available for ${role} accounts.` });
    return null;
  }

  return session;
}

function toSerializableBooking(booking) {
  const item = typeof booking?.toObject === "function" ? booking.toObject() : booking;

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
    paidAt: item.paidAt?.toISOString?.() || item.paidAt || null,
    sessionStartedAt: item.sessionStartedAt?.toISOString?.() || item.sessionStartedAt || null,
    sessionEndsAt: item.sessionEndsAt?.toISOString?.() || item.sessionEndsAt || null,
    birthDate: item.birthDate,
    birthTime: item.birthTime,
    place: item.place,
    etaMinutes: item.etaMinutes,
    status: item.status,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt || null,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt || null
  };
}

async function getConsultationRows(req, session, astrologerProfile = null) {
  if (req.app.locals.mongoReady) {
    const query =
      session.role === "user"
        ? { customerEmail: session.email }
        : session.role === "astrologer"
          ? { astrologerId: astrologerProfile?.id || "__missing__" }
          : {};
    const rows = await Consultation.find(query).sort({ createdAt: -1 }).limit(30).lean();
    return rows.map(toSerializableBooking);
  }

  // return getConsultations()
    // .filter((item) => {
    //   if (session.role === "user") return item.customerEmail === session.email;
    //   if (session.role === "astrologer") return item.astrologerId === astrologerProfile?.id;
    //   return true;
    // })
    // .map(toSerializableBooking);
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function profileCompleteness(profile) {
  if (!profile) return 0;

  const fields = [
    profile.name,
    profile.phone,
    profile.title,
    profile.bio,
    profile.city,
    profile.specialties?.length,
    profile.languages?.length,
    profile.experience !== undefined,
    profile.pricePerMinute,
    profile.modes?.length,
    profile.status,
    profile.responseTime,
    profile.availability,
    profile.education,
    profile.certifications
  ];
  const complete = fields.filter(Boolean).length;

  return Math.round((complete / fields.length) * 100);
}

router.get("/user", async (req, res, next) => {
  const session = requireRole(req, res, "user");
  if (!session) return;

  try {
    const [astrologerRows, consultations, wallet] = await Promise.all([
      listAstrologerProfiles(req),
      getConsultationRows(req, session),
      getWalletForSession(req, session)
    ]);

    const recommendations = astrologerRows
      .filter((item) => item.status !== "offline")
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        name: item.name,
        title: item.title,
        rating: item.rating,
        pricePerMinute: item.pricePerMinute,
        status: item.status,
        modes: item.modes
      }));

    const upcoming = consultations.filter((item) => item.status !== "completed").slice(0, 3);
    const history = consultations.filter((item) => item.status === "completed").slice(0, 4);

    res.json({
      profile: {
        tier: "Member",
        memberSince: "New account",
        savedBirthProfiles: 0
      },
      wallet,
      upcoming,
      history,
      savedTools: [],
      recommendations,
      notifications: []
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin", async (req, res, next) => {
  const session = requireRole(req, res, "admin");
  if (!session) return;

  try {
    const [astrologerRows, consultations] = await Promise.all([
      listAstrologerProfiles(req),
      getConsultationRows(req, session)
    ]);

    const onlineCount = astrologerRows.filter((item) => item.status === "online").length;
    const busyCount = astrologerRows.filter((item) => item.status === "busy").length;
    const offlineCount = astrologerRows.filter((item) => item.status === "offline").length;
    const revenueToday = consultations.reduce((total, item) => {
      if (item.paymentStatus && item.paymentStatus !== "paid") return total;
      return total + (Number(item.amountPaid ?? item.consultationFee) || 0);
    }, 0);
    const avgRating =
      astrologerRows.length > 0
        ? (
            astrologerRows.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) /
            astrologerRows.length
          ).toFixed(1)
        : "0.0";

    res.json({
      metrics: [
        {
          label: "Revenue today",
          value: money(revenueToday),
          detail: "From paid consultations"
        },
        {
          label: "Active bookings",
          value: String(consultations.filter((item) => item.status !== "completed").length),
          detail: "Chat and call queue"
        },
        {
          label: "Live astrologers",
          value: String(onlineCount),
          detail: `${busyCount} busy, ${offlineCount} offline`
        },
        {
          label: "Avg. rating",
          value: avgRating,
          detail: `${astrologerRows.length} listed experts`
        }
      ],
      astrologerStatus: {
        online: onlineCount,
        busy: busyCount,
        offline: offlineCount
      },
      approvalQueue: [],
      bookingQueue: consultations.slice(0, 6),
      catalogHealth: services.map((service) => ({
        id: service.id,
        title: service.title,
        status: "live",
        bookings: consultations.length,
        conversion: "0%"
      })),
      supportQueue: []
    });
  } catch (error) {
    next(error);
  }
});

router.get("/astrologer", async (req, res, next) => {
  const session = requireRole(req, res, "astrologer");
  if (!session) return;

  try {
    const profile = await getAstrologerForSession(req, session);
    const consultations = await getConsultationRows(req, session, profile);
    const upcoming = consultations.filter((item) => item.status !== "completed").slice(0, 5);
    const history = consultations.filter((item) => item.status === "completed").slice(0, 5);
    const paidConsultations = consultations.filter((item) => item.paymentStatus === "paid");
    const earnings = paidConsultations.reduce(
      (total, item) => total + (Number(item.amountPaid ?? item.consultationFee) || 0),
      0
    );

    res.json({
      profile,
      profileComplete: profileCompleteness(profile),
      metrics: [
        {
          label: "Status",
          value: profile?.status || "Draft",
          detail: profile?.responseTime ? `${profile.responseTime} response` : "Profile not listed"
        },
        {
          label: "Rate",
          value: profile?.pricePerMinute ? `Rs ${profile.pricePerMinute}/min` : "Set rate",
          detail: profile?.modes?.length ? profile.modes.join(", ") : "Choose chat or call"
        },
        {
          label: "Bookings",
          value: String(consultations.length),
          detail: `${upcoming.length} active`
        },
        {
          label: "Earnings",
          value: money(earnings),
          detail: `${paidConsultations.length} paid consultation${paidConsultations.length === 1 ? "" : "s"}`
        }
      ],
      upcoming,
      history
    });
  } catch (error) {
    next(error);
  }
});

export default router;