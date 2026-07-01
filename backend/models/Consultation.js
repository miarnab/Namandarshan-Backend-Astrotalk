import mongoose from "mongoose";

const consultationSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    astrologerId: { type: String, required: true },
    astrologerName: { type: String, required: true },
    customerId: String,
    customerEmail: String,
    customerName: { type: String, required: true },
    concern: { type: String, required: true },
    mode: { type: String, enum: ["chat", "call"], required: true },
    durationMinutes: { type: Number, default: 5 },
    consultationFee: Number,
    amountPaid: Number,
    currency: { type: String, default: "INR" },
    paymentStatus: { type: String, default: "paid" },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    paidAt: Date,
    sessionStartedAt: Date,
    sessionEndsAt: Date,
    birthDate: String,
    birthTime: String,
    place: String,
    etaMinutes: Number,
    status: { type: String, default: "confirmed" },
    chatMessages: [
      {
        id: String,
        senderId: String,
        senderRole: String,
        senderName: String,
        body: String,
        createdAt: Date
      }
    ],
    callSignals: [
      {
        id: String,
        senderRole: String,
        type: { type: String },
        data: mongoose.Schema.Types.Mixed,
        createdAt: Date
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model("Consultation", consultationSchema);