import { db } from "../db.js";

// Courses are defined in the website's code and referenced here by slug,
// e.g. "web-design". This only checks the shape of a slug.
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value) {
  return typeof value === "string" && value.length <= 100 && slugPattern.test(value);
}

// Admins can manage every course; teachers only the ones assigned to them.
export async function canTeach(user, slug) {
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  const [rows] = await db.query("SELECT 1 FROM course_teachers WHERE course_slug = ? AND teacher_id = ?", [slug, user.id]);
  return rows.length > 0;
}

export async function isEnrolled(userId, slug) {
  const [rows] = await db.query("SELECT 1 FROM enrollments WHERE student_id = ? AND course_slug = ?", [userId, slug]);
  return rows.length > 0;
}

// Course slugs a teacher manages. Admins can manage every course, so for them
// this is every course with any classroom activity (a teacher, a student, or
// content); the website adds the courses that have none yet.
export async function taughtSlugs(user) {
  const [rows] =
    user.role === "admin"
      ? await db.query(`
          SELECT course_slug FROM course_teachers
          UNION SELECT course_slug FROM enrollments
          UNION SELECT course_slug FROM materials
          UNION SELECT course_slug FROM announcements
          UNION SELECT course_slug FROM assignments
          UNION SELECT course_slug FROM class_quizzes
          UNION SELECT course_slug FROM live_sessions`)
      : await db.query("SELECT course_slug FROM course_teachers WHERE teacher_id = ?", [user.id]);
  return rows.map((r) => r.course_slug);
}

// Middleware for /courses/:slug/... routes: only that course's teachers (or admins).
export async function requireTeacherOf(req, res, next) {
  const { slug } = req.params;
  if (!isSlug(slug)) return res.status(400).json({ error: "Unknown course." });
  if (!(await canTeach(req.user, slug))) {
    return res.status(403).json({ error: "You don't teach this course.", code: "FORBIDDEN" });
  }
  next();
}

// Loads a row by id from `table` and checks the user teaches its course.
// Returns the row, or sends an error response and returns null.
export async function loadOwned(req, res, table) {
  const [rows] = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "That item no longer exists." });
    return null;
  }
  if (!(await canTeach(req.user, row.course_slug))) {
    res.status(403).json({ error: "You don't teach this course.", code: "FORBIDDEN" });
    return null;
  }
  return row;
}

// --- input helpers ---------------------------------------------------------

// Trimmed string, or "" if missing. Throws a 400-style error if too long.
export function text(value, { max, label }) {
  const s = String(value ?? "").trim();
  if (s.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`);
  return s;
}

export function requiredText(value, opts) {
  const s = text(value, opts);
  if (!s) throw badRequest(`Enter ${opts.label.toLowerCase()}.`);
  return s;
}

// Parses a date/time sent by the browser (ISO string). Throws if invalid.
export function dateTime(value, label, { required = true } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw badRequest(`Choose ${label.toLowerCase()}.`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} isn't a valid date.`);
  return d;
}

export function integer(value, { min, max, label, fallback }) {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function httpUrl(value, label) {
  const s = String(value ?? "").trim();
  let ok = false;
  try {
    ok = ["http:", "https:"].includes(new URL(s).protocol);
  } catch {
    ok = false;
  }
  if (!ok) throw badRequest(`${label} must be a full web address starting with https://`);
  if (s.length > 1000) throw badRequest(`${label} is too long.`);
  return s;
}

export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Checks a teacher-written quiz's questions and returns a clean copy.
export function cleanQuestions(value) {
  if (!Array.isArray(value) || value.length === 0) throw badRequest("Add at least one question.");
  if (value.length > 100) throw badRequest("A quiz can have at most 100 questions.");
  return value.map((q, i) => {
    const n = i + 1;
    const prompt = requiredText(q?.prompt, { max: 1000, label: `Question ${n}` });
    if (!Array.isArray(q?.options) || q.options.length < 2 || q.options.length > 6) {
      throw badRequest(`Question ${n} needs between 2 and 6 options.`);
    }
    const options = q.options.map((o, j) => ({
      id: String.fromCharCode(97 + j), // a, b, c, ...
      text: requiredText(o?.text ?? o, { max: 500, label: `Question ${n}, option ${j + 1}` }),
    }));
    const correctIndex = Number(q.correctIndex ?? options.findIndex((o) => o.id === q.correct));
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      throw badRequest(`Choose the correct answer for question ${n}.`);
    }
    return {
      id: `q${n}`,
      prompt,
      options,
      correct: options[correctIndex].id,
      explanation: text(q?.explanation, { max: 1000, label: `Question ${n} explanation` }),
    };
  });
}

// mysql2 returns JSON columns already parsed, but older setups return strings.
export function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
