import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { COOKIE_NAME, endSession, getSessionUser, publicUser, startSession } from "../lib/session.js";
import { emailPattern, passwordProblem } from "../lib/validate.js";

const router = Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  // Check again on the server — the browser's checks can be skipped.
  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!emailPattern.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const badPassword = passwordProblem(password);
  if (badPassword) return res.status(400).json({ error: badPassword });

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
  endSession(res);
  res.json({ ok: true });
});

// GET /api/auth/me — who is logged in right now?
router.get("/me", async (req, res) => {
  const user = await getSessionUser(req);
  // A cookie that no longer works (expired, tampered, deleted account) is cleared.
  if (!user && req.cookies[COOKIE_NAME]) endSession(res);
  res.json({ user: user ? publicUser(user) : null });
});

export default router;
