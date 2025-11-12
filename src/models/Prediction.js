import mongoose from "mongoose";

const sentenceSchema = new mongoose.Schema({
  text: { type: String },
  roleId: { type: String },
  confidence: { type: Number },
  originalIndex: { type: Number },
});

const predictionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  storedFilename: { type: String },
  date: { type: Date, default: Date.now },
  status: { type: String, default: "completed" },
  summary: { type: String },
  avgConfidence: { type: Number },
  sentences: [sentenceSchema],
}, { timestamps: true });

const Prediction = mongoose.model("Prediction", predictionSchema);
export default Prediction;
