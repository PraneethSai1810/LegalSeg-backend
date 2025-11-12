import "./loadEnv.js"; // must be first!
import passport from "./src/config/passport.js";
import session from "express-session";
import cors from "cors";
import express from "express";
import { swaggerDocs } from "./swagger.js";
import authRoutes from "./src/routes/authRoutes.js";
import connectDB from "./src/config/db.js";
import caseRoutes from "./src/routes/caseRoutes.js";
import path from "path";
import { fileURLToPath } from "url";  // ✅ Add this

// ✅ Recreate __dirname (since ES modules don’t have it by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ✅ Serve uploads folder publicly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(
  cors({
    origin: "http://localhost:3000", // your React app’s origin
    credentials: true, // allows cookies/auth headers if needed
  })
);

console.log("Mongo URI:", process.env.MONGO_URI);
console.log("Email:", process.env.EMAIL_USER ? process.env.EMAIL_USER : "❌ Missing");

app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/cases", caseRoutes);
swaggerDocs(app);

app.get("/", (req, res) => res.send("API running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
