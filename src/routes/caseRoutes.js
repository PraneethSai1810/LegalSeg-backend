import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import Prediction from "../models/Prediction.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import fetch from "node-fetch";
import FormData from "form-data";
import mongoose from "mongoose";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const router = express.Router();
const HF_SPACE_URL = process.env.HF_SPACE_URL;
/**
 * @swagger
 * tags:
 *   name: Cases
 *   description: Endpoints for document upload, listing, and retrieval
 */

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // ⛔ max 10 MB per file
});


function generateMockResults(filename) {
  const mockSentences = [
    { text: "The petitioner filed a case...", roleId: "facts", confidence: 92 },
    { text: "The main issue is whether...", roleId: "issues", confidence: 88 },
    { text: "The petitioner argues...", roleId: "argument_petitioner", confidence: 85 },
    { text: "The respondent contends...", roleId: "argument_respondent", confidence: 87 },
    { text: "The court considers Section 56...", roleId: "reasoning", confidence: 94 },
    { text: "After careful consideration...", roleId: "decision", confidence: 96 },
  ];
  return {
    sentences: mockSentences.map((s, i) => ({ ...s, originalIndex: i })),
    summary: "This is a mock legal summary.",
    avgConfidence: Math.round(mockSentences.reduce((a, b) => a + b.confidence, 0) / mockSentences.length),
  };
}

function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.body && req.body.userId) return next();
  return res.status(401).json({ message: "Unauthorized" });
}

/**
 * @swagger
 * /api/cases/upload:
 *   post:
 *     summary: Upload a case document or text
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               text:
 *                 type: string
 *                 example: The petitioner submitted...
 *               userId:
 *                 type: string
 *                 example: 652fb8c91a3c4a76a8cd4c72
 *     responses:
 *       201: { description: Case uploaded successfully }
 *       400: { description: User not found }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
router.post("/upload", upload.single("file"), verifyToken, async (req, res) => {
  console.log("📥 /api/cases/upload route triggered");
  try {
    const userId = (req.user && (req.user._id || req.user.id)) || req.body.userId;
    console.log("🧠 Received userId:", userId);
    if (!userId) return res.status(400).json({ message: "User not found" });

    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ message: "User not found in DB" });

    const docId = uuidv4();
    const originalName =
      (req.file && req.file.originalname) ||
      req.body.title ||
      (req.body.text ? `pasted-${docId}.txt` : `document-${docId}.txt`);
    const storedFilename = req.file ? req.file.filename : null;

    // Save pasted text if any
// ✅ FIXED: Save pasted text safely
let textToSend = "";

if (!req.file && req.body.text !== undefined) {
  const txtName = `${Date.now()}-${docId}.txt`;

  // Force any type (string/object) into plain text
  if (typeof req.body.text === "string") {
    textToSend = req.body.text.trim();
  } else if (typeof req.body.text === "object" && req.body.text !== null) {
    textToSend = req.body.text.text
      ? String(req.body.text.text).trim()
      : JSON.stringify(req.body.text);
  } else {
    textToSend = String(req.body.text).trim();
  }

  fs.writeFileSync(path.join(UPLOADS_DIR, txtName), textToSend, "utf8");
}

    console.log("📤 Sending input to Hugging Face Space (Gradio API)...");
    console.log("req.file:", !!req.file, "req.body.text length:", req.body.text?.length);

    let postResponse;

if (req.file) {
  console.log("📤 File detected — extracting text on backend...");

  const filePath = path.join(UPLOADS_DIR, req.file.filename);
  const ext = (req.file.originalname || "").toLowerCase().split(".").pop();
  let extractedText = "";

  try {
   if (ext === "pdf") {
  console.log("📄 PDF file detected, extracting text...");
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);
  extractedText = pdfData?.text?.trim() || "";
  console.log("✅ Extracted text length:", extractedText.length);
}

 else if (ext === "docx" || ext === "doc") {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result?.value?.trim() || "";
    } else if (ext === "txt") {
      extractedText = fs.readFileSync(filePath, "utf8").trim();
    } else {
      console.warn("⚠️ Unsupported file type:", ext);
      return res.status(400).json({ message: "Unsupported file format." });
    }

    // 🧹 Delete uploaded file (to keep backend clean)
    try {
      fs.unlinkSync(filePath);
      console.log("🧹 Uploaded file deleted from uploads folder.");
    } catch (e) {
      console.warn("⚠️ Could not delete uploaded file:", e.message);
    }

    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({
        message: "Could not extract readable text from uploaded file. Try another file or paste text.",
      });
    }

    // ✅ Send extracted text to model as JSON (same as text input)
    postResponse = await fetch(
      `${HF_SPACE_URL}/gradio_api/call/predict`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [extractedText, null] }),
      }
    );
  } catch (err) {
    console.error("❌ Error extracting text from file:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({
      message: "Failed to extract text from uploaded file",
      error: err.message,
    });
  }
}

 else {
  // ✅ TEXT: send clean normalized text
  const safeText =
    textToSend && textToSend.length > 0
      ? textToSend
      : typeof req.body.text === "string"
      ? req.body.text
      : JSON.stringify(req.body.text || "");

  postResponse = await fetch(
    `${HF_SPACE_URL}/gradio_api/call/predict`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [safeText, null] }),
    }
  );
}


    const postData = await postResponse.json().catch(() => ({}));
    if (!postData || !postData.event_id) {
      console.error("❌ No event_id returned from Space:", postData);
      return res.status(500).json({ message: "Space did not return event_id", postData });
    }

    // 🕒 Poll for completion
    console.log("⏳ Waiting for Space to process prediction...");
    let finalData = {};
    let errorMsg = null;

    for (let i = 0; i < 60; i++) {
  // wait before checking
  await new Promise((r) => setTimeout(r, 2000));

  // try to fetch with a small retry on stream errors
  let textResponse = null;
  try {
    const resultResponse = await fetch(
      `${HF_SPACE_URL}/gradio_api/call/predict/${postData.event_id}`
    );
    textResponse = await resultResponse.text();
  } catch (fetchErr) {
    console.warn("⚠️ Fetch error (will retry once):", fetchErr.message);
    // retry once after short delay
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const retryResp = await fetch(
        `${HF_SPACE_URL}/gradio_api/call/predict/${postData.event_id}`
      );
      textResponse = await retryResp.text();
    } catch (retryErr) {
      // continue loop and try again later
      console.warn("⚠️ Retry failed, will poll again:", retryErr.message);
      continue;
    }
  }

  if (i === 0) console.log("📦 Raw Space response (first check):", textResponse);

  if (!textResponse) continue;

  if (textResponse.includes("event: error")) {
    errorMsg = "❌ Space returned an internal error.";
    console.error("Space Error Response:", textResponse);
    break;
  }

  // data: [...] is the event stream payload; capture the bracketed JSON
  const match = textResponse.match(/data:\s*(\[[\s\S]*?\])\s*$/m) || textResponse.match(/data:\s*(\[[\s\S]*?\])/m);
  if (!match || !match[1]) {
    // not ready yet — keep polling
    continue;
  }

  // sanitize escaped unicode/newline etc.
  const clean = match[1]
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, g1) =>
      String.fromCharCode(parseInt(g1, 16))
    );

  // try to parse into actual JS objects/arrays
  try {
    const parsed = JSON.parse(clean);
    // finalData.data becomes an array (either array of strings OR array of objects)
    finalData = { data: Array.isArray(parsed) ? parsed : [parsed] };
    break;
  } catch (e) {
    // fallback: treat as plain string array element
    finalData = { data: [clean] };
    break;
  }
}


    if (errorMsg) {
      return res.status(502).json({ message: errorMsg });
    }

    console.log("✅ Space API response received:", finalData);
// ===== Parse finalData into structured sentences =====
let parsedSentences = [];

try {
  if (finalData?.data?.length) {
    // If the model returned an array of objects already (best case)
    // e.g. [{ label: "Facts", sentence: "..." }, ...]
    let arr = finalData.data;

// 🔧 Fix: unwrap nested JSON if needed
// 🔧 Final Nested JSON Fix
if (Array.isArray(arr) && typeof arr[0] === "string" && arr[0].trim().startsWith("[[")) {
  try {
    // Step 1: Clean control characters
    let cleaned = arr[0]
      .replace(/[\n\r\t]+/g, " ")         // remove invalid chars
      .replace(/\\"/g, '"')               // unescape quotes
      .replace(/\\u([\dA-Fa-f]{4})/g, (_, g1) =>
        String.fromCharCode(parseInt(g1, 16))
      );

    // Step 2: First parse (string → [[{...}, {...}]])
    const firstParsed = JSON.parse(cleaned);

    // Step 3: If nested, unwrap once more
    if (Array.isArray(firstParsed) && Array.isArray(firstParsed[0])) {
      arr = firstParsed[0];
    } else {
      arr = firstParsed;
    }

    console.log("✅ Nested JSON parsed successfully, sentences:", arr.length);
  } catch (err) {
    console.warn("⚠️ Could not parse nested JSON:", err.message);
    arr = [];
  }
}



    // Helper role map (normalize labels)
    const roleMap = {
      "facts": "facts",
      "fact": "facts",
      "issue": "issues",
      "issues": "issues",
      "arguments of petitioner": "argument_petitioner",
      "argument (petitioner)": "argument_petitioner",
      "arguments of respondent": "argument_respondent",
      "argument (respondent)": "argument_respondent",
      "reasoning": "reasoning",
      "decision": "decision",
      "none": "none",
      "arguments of petitioner": "argument_petitioner",
      "arguments of respondent": "argument_respondent"
    };

    // If array contains plain strings like "**Facts** | sentence", parse lines
    const isStringArray = arr.every(item => typeof item === "string");

    if (isStringArray) {
      // join them in case the model returned a single big string in index 0
      const text = arr.join("\n");
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

      parsedSentences = lines.map((line, i) => {
        const match = line.match(/\*\*(.*?)\*\*\s*\|\s*(.*)/);
        if (match) {
          const rawRole = match[1]?.toLowerCase().trim() || "none";
          const mapped = roleMap[rawRole] || "none";
          const txt = match[2].trim();
          return { text: txt, roleId: mapped, confidence: 1.0, originalIndex: i + 1 };
        }
        return null;
      }).filter(Boolean);
    } else {
      // array likely contains objects: try to map {label, sentence} or {role, text}
      parsedSentences = arr.map((item, i) => {
        if (!item) return null;
        if (typeof item === "object") {
          const sentenceText = item.sentence ?? item.text ?? item.output ?? item.value ?? "";
          const rawLabel = (item.label ?? item.role ?? item.tag ?? "").toString().toLowerCase().trim();
          const mapped = roleMap[rawLabel] || "none";
          return {
            text: String(sentenceText).trim(),
            roleId: mapped,
            confidence: item.confidence ?? 1.0,
            originalIndex: i + 1,
          };
        } else {
          // fallback to string parsing
          const s = String(item);
          const match = s.match(/\*\*(.*?)\*\*\s*\|\s*(.*)/);
          if (match) {
            const rawRole = match[1]?.toLowerCase().trim() || "none";
            const mapped = roleMap[rawRole] || "none";
            return { text: match[2].trim(), roleId: mapped, confidence: 1.0, originalIndex: i + 1 };
          }
          return null;
        }
      }).filter(Boolean);
    }
  }
} catch (err) {
  console.error("⚠️ Parser error:", err.message);
}

// ✅ Attach structured results for frontend
finalData.sentences = parsedSentences;

const results = {
  summary: "Processed successfully",
  sentences: finalData.sentences || [],
  avgConfidence: 1.0,
};


    // ✅ Save prediction + results
    const caseRecord = {
      id: docId,
      title: originalName,
      storedFilename,
      date: new Date(),
      sentenceCount: results.sentences?.length || 0,
      status: "completed",
      results,
    };

    // ✅ Send response immediately
res.status(201).json({ document: caseRecord, results });

// ✅ Save prediction in background (non-blocking)
(async () => {
  try {
    user.cases = [caseRecord, ...(user.cases || [])];
    await user.save();

    const predictionDoc = new Prediction({
      userId,
      title: originalName,
      storedFilename,
      date: new Date(),
      status: "completed",
      summary: results.summary || "",
      avgConfidence: results.avgConfidence || 0,
      sentences: results.sentences || [],
    });

    await predictionDoc.save();
    console.log("✅ Prediction saved successfully with ID:", predictionDoc._id);
  } catch (err) {
    console.warn("⚠️ Background save failed:", err.message);
  }
})();
  } catch (err) {
    console.error("❌ Error in /api/cases/upload:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/cases:
 *   get:
 *     summary: Get all uploaded cases for the logged-in user
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: query
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of user's documents }
 *       400: { description: User not provided }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */
router.get("/", verifyToken, async (req, res) =>{
  try {
    const userId = (req.user && (req.user._id || req.user.id)) || req.query.userId;
    if (!userId) return res.status(400).json({ message: "User not provided" });

    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ documents: user.cases || [] });
  } catch (err) {
    console.error("Error in GET /api/cases:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/cases/{id}:
 *   get:
 *     summary: Get a specific case by ID
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Case details retrieved }
 *       404: { description: Case not found }
 *       500: { description: Server error }
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userId = (req.user && (req.user._id || req.user.id)) || req.query.userId;
    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const doc = (user.cases || []).find((c) => c.id === req.params.id);
    if (!doc) return res.status(404).json({ message: "Case not found" });

    return res.json({ document: doc });
  } catch (err) {
    console.error("Error in GET /api/cases/:id:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/cases/predictions/all:
 *   get:
 *     summary: Get all stored predictions for the logged-in user
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user's predictions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 predictions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "672d7ac8c9355d18b1b0a4c9"
 *                       userId:
 *                         type: string
 *                         example: "672d7a43c9355d18b1b0a4c5"
 *                       title:
 *                         type: string
 *                         example: "sample_case.txt"
 *                       storedFilename:
 *                         type: string
 *                         example: "1730227568000-uuid.txt"
 *                       date:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-10-30T14:00:00.000Z"
 *                       status:
 *                         type: string
 *                         example: "completed"
 *                       summary:
 *                         type: string
 *                         example: "This is a mock legal summary."
 *                       avgConfidence:
 *                         type: number
 *                         example: 92
 *                       sentences:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             text:
 *                               type: string
 *                               example: "The petitioner filed a case..."
 *                             roleId:
 *                               type: string
 *                               example: "facts"
 *                             confidence:
 *                               type: number
 *                               example: 92
 *                             originalIndex:
 *                               type: number
 *                               example: 0
 *       400:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/predictions/all", verifyToken, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(400).json({ message: "User not found" });

    const predictions = await Prediction.find({ userId }).sort({ date: -1 });
    return res.status(200).json({ predictions });
  } catch (err) {
    console.error("Error fetching predictions:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


/**
 * @swagger
 * /api/cases/predictions/{id}:
 *   get:
 *     summary: Get a specific prediction by its ID
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The unique ID of the prediction
 *         schema:
 *           type: string
 *           example: "672d7ac8c9355d18b1b0a4c9"
 *     responses:
 *       200:
 *         description: Successfully retrieved the prediction
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prediction:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "672d7ac8c9355d18b1b0a4c9"
 *                     userId:
 *                       type: string
 *                       example: "672d7a43c9355d18b1b0a4c5"
 *                     title:
 *                       type: string
 *                       example: "uploaded_case.txt"
 *                     storedFilename:
 *                       type: string
 *                       example: "1730227568000-uuid.txt"
 *                     date:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-10-30T14:00:00.000Z"
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     summary:
 *                       type: string
 *                       example: "This is a mock legal summary."
 *                     avgConfidence:
 *                       type: number
 *                       example: 92
 *                     sentences:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           text:
 *                             type: string
 *                             example: "The petitioner filed a case..."
 *                           roleId:
 *                             type: string
 *                             example: "facts"
 *                           confidence:
 *                             type: number
 *                             example: 92
 *                           originalIndex:
 *                             type: number
 *                             example: 0
 *       400:
 *         description: User not found
 *       404:
 *         description: Prediction not found
 *       500:
 *         description: Server error
 */

router.get("/predictions/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(400).json({ message: "User not found" });

    const { id } = req.params;

    // ✅ Handles both ObjectId and UUID (docId)
    let query = { userId };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query._id = id;
    } else {
      query.id = id; // match your UUID docId field
    }

    const prediction = await Prediction.findOne(query);

    if (!prediction) {
      console.warn("⚠️ No prediction found for ID:", id);
      return res.status(404).json({ message: "Prediction not found" });
    }

    const predObj = prediction.toObject ? prediction.toObject() : { ...prediction };
    predObj.title =
      predObj.title ||
      predObj.storedFilename ||
      predObj.fileName ||
      predObj.originalName ||
      `Document ${String(predObj._id || id).slice(0, 8)}`;
    predObj.date = predObj.date || predObj.createdAt || new Date();

    return res.status(200).json({ prediction: predObj });
  } catch (err) {
    console.error("Error fetching prediction by ID:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
