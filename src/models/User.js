// src/models/User.js
import mongoose from "mongoose";

const caseSchema = new mongoose.Schema({
  id: { type: String, required: true }, // unique id for the case (uuid or timestamp)
  title: { type: String, required: true },
  storedFilename: { type: String }, // filename saved on server (if file upload)
  date: { type: Date, default: Date.now },
  sentenceCount: { type: Number, default: 0 },
  status: { type: String, default: "completed" },
  results: {
    type: {
      sentences: [
        {
          text: String,
          roleId: String,
          confidence: Number,
          originalIndex: Number,
        },
      ],
      summary: String,
      avgConfidence: Number,
    },
    default: {},
  },
});

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  googleId: { type: String },
  otp: { type: String },
  otpExpires: { type: Date },

  // store uploaded / analyzed documents
  cases: { type: [caseSchema], default: [] },
});

export default mongoose.model("User", userSchema);
