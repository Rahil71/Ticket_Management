import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`[DB] MongoDB Atlas connected: ${mongoose.connection.host}`);
};

export default connectDB;
