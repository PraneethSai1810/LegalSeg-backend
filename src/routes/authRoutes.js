import express from "express";
import passport from "passport";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import nodemailer from "nodemailer";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & user management endpoints
 */

// =============================
// ✅ EMAIL CONFIG (Gmail)
// =============================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) console.error("❌ Email transporter failed:", error);
  else console.log("✅ Email transporter ready to send messages");
});

// =============================
// ✅ REGISTER
// =============================
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: John Doe }
 *               email: { type: string, example: johndoe@gmail.com }
 *               password: { type: string, example: 123456 }
 *     responses:
 *       201: { description: User registered successfully }
 *       400: { description: User already exists }
 *       500: { description: Server error }
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1️⃣ Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    // 2️⃣ Hash password
    const hashed = await bcrypt.hash(password, 10);

    // 3️⃣ Create new user
    const newUser = new User({ name, email, password: hashed });
    await newUser.save();

    // 4️⃣ Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // 5️⃣ Exclude password from response
    const userResponse = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
    };

    // 6️⃣ Send success response
    res.status(201).json({
      message: "User registered successfully",
      token,
      user: userResponse,
    });
  } catch (err) {
    console.error("❌ Error in /register:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// =============================
// ✅ LOGIN
// =============================
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and get JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: johndoe@gmail.com }
 *               password: { type: string, example: 123456 }
 *     responses:
 *       200: { description: Login successful, returns JWT token }
 *       401: { description: Invalid password }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2️⃣ Check password validity
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid password" });

    // 3️⃣ Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // 4️⃣ Prepare user object (excluding password)
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
    };

    // 5️⃣ Send full response
    res.json({
      message: "Login successful",
      token,
      user: userResponse,
    });
  } catch (err) {
    console.error("❌ Error in /login:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =============================
// ✅ SEND OTP
// =============================
/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send OTP to user email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: johndoe@gmail.com }
 *     responses:
 *       200: { description: OTP sent successfully }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. It will expire in 10 minutes.`,
    });

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// ✅ VERIFY OTP
// =============================
/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify user's OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, example: johndoe@gmail.com }
 *               otp: { type: string, example: 123456 }
 *     responses:
 *       200: { description: OTP verified successfully }
 *       400: { description: Invalid or expired OTP }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (Date.now() > user.otpExpires)
      return res.status(400).json({ message: "OTP expired" });

    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// ✅ RESET PASSWORD
// =============================
/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, newPassword]
 *             properties:
 *               email: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Password reset successful }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// ✅ PROFILE (Protected)
// =============================
/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user's profile (requires token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User profile retrieved }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */
router.get("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password -otp -otpExpires");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update user's name (requires token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: New Name }
 *     responses:
 *       200: { description: Profile updated successfully }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
router.put("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      decoded.id,
      { name },
      { new: true, select: "-password -otp -otpExpires" }
    );

    res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Google Auth (excluded from Swagger)
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      const user = req.user;

      // Generate JWT
      const token = jwt.sign(
        { id: user._id, email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // ✅ Redirect with token in URL
      console.log("✅ Redirecting to frontend with token:", token);
      res.redirect(`http://localhost:3000/dashboard?token=${token}`);
    } catch (err) {
      console.error("Google callback error:", err);
      res.redirect("http://localhost:3000/login");
    }
  }
);



export default router;
