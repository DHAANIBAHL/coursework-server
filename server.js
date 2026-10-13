import express from "express";
import cookieParser from "cookie-parser";
import { db } from "./db.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import contactRoutes from "./routes/contact.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Add it to your .env file.");
  process.exit(1);
}

const app = express();

app.use(express.json());   // read JSON request bodies
app.use(cookieParser());   // read the login cookie

app.use("/api/auth", authRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Any error thrown in a route ends up here.
app.use((err, req, res, next) => {
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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
