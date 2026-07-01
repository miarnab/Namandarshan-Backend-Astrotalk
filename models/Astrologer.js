import mongoose from "mongoose";

const astrologerSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, unique: true, sparse: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    title: { type: String, required: true },
    bio: { type: String, required: true },
    city: { type: String, required: true },
    specialties: [{ type: String }],
    languages: [{ type: String }],
    experience: { type: Number, required: true, min: 0 },
    rating: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    pricePerMinute: { type: Number, required: true, min: 1 },
    modes: [{ type: String, enum: ["chat", "call"] }],
    status: { type: String, enum: ["online", "busy", "offline"], default: "online" },
    responseTime: { type: String, required: true },
    availability: { type: String, required: true },
    education: { type: String, required: true },
    certifications: { type: String, required: true },
    accent: { type: String, default: "#f4b400" }
  },
  { timestamps: true }
);

export default mongoose.model("Astrologer", astrologerSchema);