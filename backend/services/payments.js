import crypto from "node:crypto";
import Razorpay from "razorpay";
import PaymentOrder from "../models/PaymentOrder.js";

const memoryPaymentOrders = new Map();
let razorpayClient = null;

function getRazorpayKeys() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || ""
  };
}

function requireRazorpayKeys() {
  const keys = getRazorpayKeys();

  if (!keys.keyId || !keys.keySecret) {
    const error = new Error(
      "Razorpay credentials are not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file."
    );
    error.status = 500;
    throw error;
  }

  return keys;
}

function getRazorpayClient() {
  const keys = requireRazorpayKeys();

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: keys.keyId,
      key_secret: keys.keySecret
    });
  }

  return razorpayClient;
}

export function toPaise(amount) {
  return Math.round(Number(amount) * 100);
}

export function makeReceipt(prefix) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now().toString(36)}_${suffix}`.slice(0, 40);
}

export function publicCheckoutOrder(paymentOrder) {
  const keys = requireRazorpayKeys();

  return {
    key: keys.keyId,
    purpose: paymentOrder.purpose,
    amount: paymentOrder.amount,
    currency: paymentOrder.currency,
    order: {
      id: paymentOrder.razorpayOrderId,
      amount: paymentOrder.amountPaise,
      currency: paymentOrder.currency,
      receipt: paymentOrder.receipt
    }
  };
}

export async function createPaymentOrder(
  req,
  { session, purpose, amount, receiptPrefix, notes = {}, consultation = null, wallet = null }
) {
  const amountPaise = toPaise(amount);
  const currency = process.env.RAZORPAY_CURRENCY || "INR";
  const receipt = makeReceipt(receiptPrefix || purpose);
  const razorpayOrder = await getRazorpayClient().orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes
  });
  const paymentOrder = {
    razorpayOrderId: razorpayOrder.id,
    userId: session.id,
    userEmail: session.email,
    userName: session.name,
    purpose,
    amount: Number(amount),
    amountPaise,
    currency,
    receipt,
    status: "created",
    consultation,
    wallet
  };

  if (req.app.locals.mongoReady) {
    return PaymentOrder.create(paymentOrder);
  }

  const now = new Date();
  const memoryOrder = {
    ...paymentOrder,
    createdAt: now,
    updatedAt: now
  };
  memoryPaymentOrders.set(memoryOrder.razorpayOrderId, memoryOrder);
  return memoryOrder;
}

export async function findPaymentOrder(req, razorpayOrderId) {
  if (req.app.locals.mongoReady) {
    return PaymentOrder.findOne({ razorpayOrderId });
  }

  return memoryPaymentOrders.get(razorpayOrderId) || null;
}

export async function markPaymentOrderFailed(req, razorpayOrderId) {
  if (req.app.locals.mongoReady) {
    return PaymentOrder.findOneAndUpdate(
      { razorpayOrderId },
      { status: "failed" },
      { new: true }
    );
  }

  const order = memoryPaymentOrders.get(razorpayOrderId);
  if (!order) return null;
  order.status = "failed";
  order.updatedAt = new Date();
  memoryPaymentOrders.set(razorpayOrderId, order);
  return order;
}

export async function markPaymentOrderPaid(req, razorpayOrderId, result) {
  const update = {
    status: "paid",
    razorpayPaymentId: result.razorpayPaymentId,
    result: result.payload,
    paidAt: new Date()
  };

  if (req.app.locals.mongoReady) {
    return PaymentOrder.findOneAndUpdate({ razorpayOrderId }, update, { new: true });
  }

  const order = memoryPaymentOrders.get(razorpayOrderId);
  if (!order) return null;
  Object.assign(order, update, { updatedAt: new Date() });
  memoryPaymentOrders.set(razorpayOrderId, order);
  return order;
}

export function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const { keySecret } = requireRazorpayKeys();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(razorpaySignature || ""));

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}