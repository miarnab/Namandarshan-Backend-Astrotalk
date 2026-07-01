import mongoose from "mongoose";

const paymentOrderSchema = new mongoose.Schema(
  {
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    razorpayPaymentId: String,
    userId: String,
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    userName: String,
    purpose: {
      type: String,
      enum: ["consultation", "wallet"],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    amountPaise: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    receipt: String,
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created"
    },
    consultation: mongoose.Schema.Types.Mixed,
    wallet: mongoose.Schema.Types.Mixed,
    result: mongoose.Schema.Types.Mixed,
    paidAt: Date
  },
  { timestamps: true }
);

export default mongoose.models.PaymentOrder || mongoose.model("PaymentOrder", paymentOrderSchema);