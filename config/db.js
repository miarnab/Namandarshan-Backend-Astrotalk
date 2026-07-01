import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.log("MongoDB is not configured. Using empty in-memory data.");
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    console.log("MongoDB connected.");
    return true;
  } catch (error) {
    console.warn(`MongoDB connection failed: ${error.message}`);
    console.warn("Continuing with empty in-memory data.");
    return false;
  }
}