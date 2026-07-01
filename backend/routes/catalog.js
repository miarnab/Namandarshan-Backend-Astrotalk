import { Router } from "express";
// import { horoscopes, services, testimonials } from "../data/seed.js";
import { listAstrologerProfiles } from "./auth.js";

const router = Router();

const normalize = (value = "") => String(value).trim().toLowerCase();

function applyFilters(rows, query) {
  const specialty = normalize(query.specialty);
  const language = normalize(query.language);
  const mode = normalize(query.mode);
  const search = normalize(query.search);
  const sort = normalize(query.sort || "recommended");

  let result = [...rows];

  if (specialty) {
    result = result.filter((item) =>
      item.specialties.some((entry) => normalize(entry) === specialty)
    );
  }

  if (language) {
    result = result.filter((item) => item.languages.some((entry) => normalize(entry) === language));
  }

  if (mode) {
    result = result.filter((item) => item.modes.includes(mode));
  }

  if (search) {
    result = result.filter((item) => {
      const haystack = [item.name, item.title, ...item.specialties, ...item.languages]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  if (sort === "price") {
    result.sort((a, b) => a.pricePerMinute - b.pricePerMinute);
  } else if (sort === "experience") {
    result.sort((a, b) => b.experience - a.experience);
  } else if (sort === "rating") {
    result.sort((a, b) => b.rating - a.rating);
  } else {
    result.sort((a, b) => Number(b.status === "online") - Number(a.status === "online") || b.rating - a.rating);
  }

  return result;
}

async function getAstrologers(req) {
  return listAstrologerProfiles(req);
}

function buildStats(rows) {
  const onlineCount = rows.filter((item) => item.status === "online").length;
  const languageCount = new Set(rows.flatMap((item) => item.languages || [])).size;
  const averageRating =
    rows.length > 0
      ? (rows.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) / rows.length).toFixed(1)
      : "New";

  return [
    { label: "Astrologers", value: String(rows.length) },
    { label: "Live now", value: String(onlineCount) },
    { label: "Avg. rating", value: averageRating },
    { label: "Languages", value: String(languageCount) }
  ];
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend" });
});

router.get("/stats", async (req, res, next) => {
  try {
    res.json(buildStats(await getAstrologers(req)));
  } catch (error) {
    next(error);
  }
});

// router.get("/services", (_req, res) => {
//   res.json(services);
// });

// router.get("/testimonials", (_req, res) => {
//   res.json(testimonials);
// });

router.get("/astrologers", async (req, res, next) => {
  try {
    const rows = await getAstrologers(req);
    const filtered = applyFilters(rows, req.query);
    res.json(filtered);
  } catch (error) {
    next(error);
  }
});

router.get("/filters", async (req, res, next) => {
  try {
    const rows = await getAstrologers(req);
    const specialties = [...new Set(rows.flatMap((item) => item.specialties))].sort();
    const languages = [...new Set(rows.flatMap((item) => item.languages))].sort();
    res.json({ specialties, languages, modes: ["chat", "call"] });
  } catch (error) {
    next(error);
  }
});

// router.get("/horoscope", (req, res) => {
//   const sign = normalize(req.query.sign || "leo");
//   const horoscope = horoscopes[sign] || horoscopes.leo;
//   res.json({
//     ...horoscope,
//     date: new Intl.DateTimeFormat("en-IN", {
//       weekday: "long",
//       day: "numeric",
//       month: "long",
//       year: "numeric"
//     }).format(new Date())
//   });
// });

export default router;