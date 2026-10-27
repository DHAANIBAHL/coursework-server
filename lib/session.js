import jwt from "jsonwebtoken";
import { db } from "../db.js";

export const COOKIE_NAME = "coursework_token";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const ROLES = ["student", "teacher", "admin"];

// httpOnly means JavaScript in the browser can't read the cookie,
// which protects the login token from being stolen by injected scripts.
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

export function startSession(res, user) {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS });
}

export function endSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

// Only these fields are ever sent to the browser — never the password hash.
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Returns the logged-in user from the request's cookie, or null.
// The user is read from the database each time, so a role change
// (or a deleted account) takes effect on the very next request.
export async function getSessionUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  let id;
  try {
    ({ id } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return null; // expired or tampered token
  }
  const [rows] = await db.query("SELECT id, name, email, role FROM users WHERE id = ?", [id]);
  return rows[0] ?? null;
}

// Middleware: only logged-in users get through; sets req.user.
export async function requireAuth(req, res, next) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Please log in.", code: "NOT_LOGGED_IN" });
  req.user = user;
  next();
}

// Middleware: only users with one of these roles get through.
// Use after requireAuth, e.g. router.use(requireAuth, requireRole("admin")).
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "You don't have access to this.", code: "FORBIDDEN" });
    }
    next();
  };
}
