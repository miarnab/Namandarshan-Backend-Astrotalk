import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: ["user", "admin", "astrologer"],
      default: "user",
      required: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    adminCodeVerified: {
      type: Boolean,
      default: false
    },
    profile: {
      birthDate: {
        type: String,
        default: "",
        trim: true
      },
      birthTime: {
        type: String,
        default: "",
        trim: true
      },
      place: {
        type: String,
        default: "",
        trim: true
      },
      concern: {
        type: String,
        default: "",
        trim: true
      },
      gender: {
        type: String,
        default: "",
        trim: true
      },
      preferredLanguage: {
        type: String,
        default: "",
        trim: true
      }
    },
    wallet: {
      balance: {
        type: Number,
        default: 0
      },
      rewards: {
        type: Number,
        default: 0
      },
      freeMinutes: {
        type: Number,
        default: 0
      },
      spendThisMonth: {
        type: Number,
        default: 0
      }
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.User || mongoose.model("User", userSchema);