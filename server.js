import express from "express";
import cookieParser from "cookie-parser";
import { catalogDb, db } from "./db.js";
import adminRoutes from "./routes/admin.js";
import aiRoutes from "./routes/ai.js";
import authRoutes from "./routes/auth.js";
import contactRoutes from "./routes/contact.js";
import courseRoutes from "./routes/courses.js";
import fileRoutes from "./routes/files.js";
import learnRoutes from "./routes/learn.js";
import teachRoutes from "./routes/teach.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Add it to your .env file.");
  process.exit(1);
}

const app = express();

app.use(express.json());   // read JSON request bodies
app.use(cookieParser());   // read the login cookie

app.use("/api/auth", authRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teach/ai", aiRoutes);
app.use("/api/teach", teachRoutes);
app.use("/api/learn", learnRoutes);
app.use("/api/files", fileRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Any error thrown in a route ends up here. Input problems (status 400,
// thrown by the helpers in lib/classroom.js) go back to the user as-is.
app.use((err, req, res, next) => {
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

// Check the database connection before accepting requests.
try {
  await db.query("SELECT 1");
  console.log("Connected to MySQL");
} catch (err) {
  console.error("Could not connect to MySQL:", err.message);
  console.error("Check DB_USER, DB_PASSWORD and DB_NAME in your .env file.");
  process.exit(1);
}

// The catalog database is separate; without it only /api/courses fails.
try {
  await catalogDb.query("SELECT 1 FROM courses LIMIT 1");
} catch (err) {
  console.warn("Course catalog database unavailable:", err.message);
  console.warn("Load coursework-app/database/schema.sql and seed.sql into CATALOG_DB_NAME (default learning_platform).");
}

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
