import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";

const router = Router();

const COOKIE_NAME = "coursework_token";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// httpOnly means JavaScript in the browser can't read the cookie,
// which protects the login token from being stolen by injected scripts.
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

function startSession(res, user) {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS });
}

// Only these fields are ever sent to the browser — never the password hash.
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  // Check again on the server — the browser's checks can be skipped.
  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!emailPattern.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (password.length > 72) return res.status(400).json({ error: "Password must be 72 characters or fewer." });

  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const [result] = await db.query(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash]
    );
    const user = { id: result.insertId, name, email, role: "student" };
    startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // Two sign-ups with the same email at the same moment
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    throw err;
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ error: "Enter your email and password." });
  }

  const [rows] = await db.query(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = ?",
    [email]
  );
  const user = rows[0];

  // No account with this email: tell the browser so it can offer sign-up.
  // (Sign-up already reveals whether an email is registered, so hiding it
  // here wouldn't protect anything.)
  if (!user) {
    return res.status(404).json({
      error: "We couldn't find an account with that email.",
      code: "NO_ACCOUNT",
    });
  }

  if (!(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect password.", code: "WRONG_PASSWORD" });
  }

  startSession(res, user);
  res.json({ user: publicUser(user) });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
});

// GET /api/auth/me — who is logged in right now?
router.get("/me", async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ user: null });

  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query("SELECT id, name, email, role FROM users WHERE id = ?", [id]);
    if (rows.length === 0) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.json({ user: null });
    }
    res.json({ user: publicUser(rows[0]) });
  } catch {
    // Expired or tampered token
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ user: null });
  }
});

export default router;
