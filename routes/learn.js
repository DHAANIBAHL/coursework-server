import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../lib/session.js";
import { badRequest, integer, isEnrolled, isSlug, parseJson, text } from "../lib/classroom.js";
import { deleteUpload, fileFields, handleUpload, submissionUpload } from "../lib/uploads.js";
import * as out from "../lib/serialize.js";

// Everything a student does: joining courses, progress, submissions, quizzes.
// Any logged-in account can enroll and learn.
const router = Router();
router.use(requireAuth);

function slugParam(req) {
  if (!isSlug(req.params.slug)) throw badRequest("Unknown course.");
  return req.params.slug;
}

async function requireEnrolled(req, res, next) {
  const slug = slugParam(req);
  if (!(await isEnrolled(req.user.id, slug))) {
    return res.status(403).json({ error: "Join this course first.", code: "NOT_ENROLLED" });
  }
  next();
}

// Loads a row from `table` by :id and checks the student is enrolled in its course.
async function loadForStudent(req, res, table) {
  const [[row]] = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
  if (!row) {
    res.status(404).json({ error: "That item no longer exists." });
    return null;
  }
  if (!(await isEnrolled(req.user.id, row.course_slug))) {
    res.status(403).json({ error: "Join this course first.", code: "NOT_ENROLLED" });
    return null;
  }
  return row;
}

// --- Enrollment and progress ------------------------------------------------------

// GET /api/learn/enrollments — the courses I've joined, with lesson progress.
router.get("/enrollments", async (req, res) => {
  const [rows] = await db.query(
    `SELECT e.course_slug, e.enrolled_at,
       (SELECT COUNT(*) FROM lesson_progress p WHERE p.student_id = e.student_id AND p.course_slug = e.course_slug) AS lessons_done,
       (SELECT MAX(completed_at) FROM lesson_progress p WHERE p.student_id = e.student_id AND p.course_slug = e.course_slug) AS last_activity
     FROM enrollments e WHERE e.student_id = ? ORDER BY COALESCE(last_activity, e.enrolled_at) DESC`,
    [req.user.id]
  );
  res.json({
    enrollments: rows.map((r) => ({
      slug: r.course_slug,
      enrolledAt: r.enrolled_at,
      lessonsDone: r.lessons_done,
      lastActivity: r.last_activity,
    })),
  });
});

router.post("/courses/:slug/enroll", async (req, res) => {
  const slug = slugParam(req);
  await db.query("INSERT IGNORE INTO enrollments (student_id, course_slug) VALUES (?, ?)", [req.user.id, slug]);
  res.status(201).json({ ok: true });
});

// Leaving a course keeps lesson progress, so rejoining picks up where you left off.
router.delete("/courses/:slug/enroll", async (req, res) => {
  const slug = slugParam(req);
  await db.query("DELETE FROM enrollments WHERE student_id = ? AND course_slug = ?", [req.user.id, slug]);
  res.json({ ok: true });
});

// PUT/DELETE /api/learn/courses/:slug/lessons/:index — mark a lesson complete or not.
router.put("/courses/:slug/lessons/:index", requireEnrolled, async (req, res) => {
  const index = integer(req.params.index, { min: 0, max: 999, label: "Lesson" });
  await db.query("INSERT IGNORE INTO lesson_progress (student_id, course_slug, lesson_index) VALUES (?, ?, ?)", [
    req.user.id,
    req.params.slug,
    index,
  ]);
  res.json({ ok: true });
});

router.delete("/courses/:slug/lessons/:index", requireEnrolled, async (req, res) => {
  const index = integer(req.params.index, { min: 0, max: 999, label: "Lesson" });
  await db.query("DELETE FROM lesson_progress WHERE student_id = ? AND course_slug = ? AND lesson_index = ?", [
    req.user.id,
    req.params.slug,
    index,
  ]);
  res.json({ ok: true });
});

// --- One course's classroom ---------------------------------------------------------

// GET /api/learn/courses/:slug — the class side of a course: my progress, the
// teacher's material, announcements, assignments, quizzes, and live sessions.
router.get("/courses/:slug", async (req, res) => {
  const slug = slugParam(req);
  const [teachers] = await db.query(
    "SELECT u.name FROM course_teachers t JOIN users u ON u.id = t.teacher_id WHERE t.course_slug = ? ORDER BY u.name",
    [slug]
  );
  if (!(await isEnrolled(req.user.id, slug))) {
    return res.json({ enrolled: false, teachers: teachers.map((t) => t.name) });
  }

  const me = req.user.id;
  const [progress] = await db.query(
    "SELECT lesson_index FROM lesson_progress WHERE student_id = ? AND course_slug = ? ORDER BY lesson_index",
    [me, slug]
  );
  const [materials] = await db.query("SELECT * FROM materials WHERE course_slug = ? ORDER BY created_at DESC, id DESC", [slug]);
  const [announcements] = await db.query(
    `SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.course_slug = ? ORDER BY a.created_at DESC, a.id DESC`,
    [slug]
  );
  const [assignments] = await db.query("SELECT * FROM assignments WHERE course_slug = ? ORDER BY due_at", [slug]);
  const [mySubmissions] = await db.query(
    "SELECT s.* FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_slug = ? AND s.student_id = ?",
    [slug, me]
  );
  const [quizzes] = await db.query(
    "SELECT * FROM class_quizzes WHERE course_slug = ? AND published ORDER BY COALESCE(due_at, created_at)",
    [slug]
  );
  const [myAttempts] = await db.query(
    "SELECT quiz_key, MAX(score) AS best, MAX(total) AS total, COUNT(*) AS attempts FROM quiz_attempts WHERE student_id = ? AND course_slug = ? GROUP BY quiz_key",
    [me, slug]
  );
  const [sessions] = await db.query(
    "SELECT * FROM live_sessions WHERE course_slug = ? ORDER BY starts_at",
    [slug]
  );

  const subBy = Object.fromEntries(mySubmissions.map((s) => [s.assignment_id, out.submission(s)]));
  const attemptBy = Object.fromEntries(
    myAttempts.map((a) => [a.quiz_key, { best: a.best, total: a.total, attempts: a.attempts }])
  );

  res.json({
    enrolled: true,
    teachers: teachers.map((t) => t.name),
    completedLessons: progress.map((p) => p.lesson_index),
    materials: materials.map(out.material),
    announcements: announcements.map(out.announcement),
    assignments: assignments.map((a) => ({ ...out.assignment(a), mySubmission: subBy[a.id] ?? null })),
    quizzes: quizzes.map((q) => ({
      ...out.classQuiz(q, { forStudent: true }),
      questions: undefined, // fetched when the quiz is opened
      myResult: attemptBy[`class:${q.id}`] ?? null,
    })),
    builtinQuizResults: Object.fromEntries(
      Object.entries(attemptBy)
        .filter(([key]) => key.startsWith("builtin:"))
        .map(([key, v]) => [key.slice("builtin:".length), v])
    ),
    sessions: sessions.map(out.liveSession),
  });
});

// --- Dashboard -----------------------------------------------------------------------

// GET /api/learn/dashboard — everything for the student home page in one request.
router.get("/dashboard", async (req, res) => {
  const me = req.user.id;
  const [enrolled] = await db.query("SELECT course_slug FROM enrollments WHERE student_id = ?", [me]);
  const slugs = enrolled.length ? enrolled.map((e) => e.course_slug) : ["__none__"];

  const [assignmentsDue] = await db.query(
    `SELECT a.*, s.id AS submission_id, s.grade
     FROM assignments a LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
     WHERE a.course_slug IN (?) AND (s.id IS NULL OR a.due_at >= NOW() - INTERVAL 7 DAY)
     ORDER BY a.due_at LIMIT 50`,
    [me, slugs]
  );
  const [quizzesDue] = await db.query(
    `SELECT q.id, q.course_slug, q.title, q.due_at
     FROM class_quizzes q
     WHERE q.course_slug IN (?) AND q.published AND q.due_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM quiz_attempts t WHERE t.student_id = ? AND t.quiz_key = CONCAT('class:', q.id))
     ORDER BY q.due_at LIMIT 20`,
    [slugs, me]
  );
  const [sessions] = await db.query(
    `SELECT * FROM live_sessions
     WHERE course_slug IN (?) AND starts_at + INTERVAL duration_min MINUTE >= NOW() AND starts_at <= NOW() + INTERVAL 30 DAY
     ORDER BY starts_at LIMIT 10`,
    [slugs]
  );
  const [announcements] = await db.query(
    `SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.course_slug IN (?) ORDER BY a.created_at DESC, a.id DESC LIMIT 8`,
    [slugs]
  );
  const [grades] = await db.query(
    `SELECT s.*, a.title AS assignment_title, a.course_slug, a.max_points
     FROM submissions s JOIN assignments a ON a.id = s.assignment_id
     WHERE s.student_id = ? AND s.grade IS NOT NULL ORDER BY s.graded_at DESC LIMIT 5`,
    [me]
  );
  const [[quizStats]] = await db.query(
    "SELECT AVG(score / total) AS avg, COUNT(*) AS n FROM quiz_attempts WHERE student_id = ? AND total > 0",
    [me]
  );
  const [[lessonStats]] = await db.query("SELECT COUNT(*) AS n FROM lesson_progress WHERE student_id = ?", [me]);
  const [[submittedStats]] = await db.query("SELECT COUNT(*) AS n FROM submissions WHERE student_id = ?", [me]);

  const deadlines = [
    ...assignmentsDue.map((a) => ({
      type: "assignment",
      id: a.id,
      courseSlug: a.course_slug,
      title: a.title,
      dueAt: a.due_at,
      status: a.grade !== null ? "graded" : a.submission_id ? "submitted" : new Date(a.due_at) < new Date() ? "overdue" : "todo",
    })),
    ...quizzesDue.map((q) => ({
      type: "quiz",
      id: q.id,
      courseSlug: q.course_slug,
      title: q.title,
      dueAt: q.due_at,
      status: new Date(q.due_at) < new Date() ? "overdue" : "todo",
    })),
  ].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  res.json({
    stats: {
      courses: enrolled.length,
      lessonsDone: lessonStats.n,
      quizAverage: quizStats.n ? Number(quizStats.avg) : null,
      quizzesTaken: quizStats.n,
      submitted: submittedStats.n,
      due: deadlines.filter((d) => d.status === "todo" || d.status === "overdue").length,
    },
    deadlines,
    sessions: sessions.map(out.liveSession),
    announcements: announcements.map(out.announcement),
    recentGrades: grades.map((g) => ({
      ...out.submission(g),
      assignmentTitle: g.assignment_title,
      courseSlug: g.course_slug,
      maxPoints: g.max_points,
    })),
  });
});

// --- Assignments ----------------------------------------------------------------------

// POST /api/learn/assignments/:id/submission — multipart: text and/or file.
// Resubmitting replaces the previous submission, until it has been graded.
router.post("/assignments/:id/submission", handleUpload(submissionUpload), async (req, res) => {
  try {
    const row = await loadForStudent(req, res, "assignments");
    if (!row) return deleteUpload(req.file?.filename);

    const textAnswer = text(req.body?.text, { max: 50000, label: "Your answer" });
    if (!textAnswer && !req.file) throw badRequest("Write an answer or attach a file.");

    const [[existing]] = await db.query("SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?", [
      row.id,
      req.user.id,
    ]);
    if (existing?.grade !== null && existing?.grade !== undefined) {
      deleteUpload(req.file?.filename);
      return res.status(409).json({ error: "This has already been graded, so it can't be changed.", code: "ALREADY_GRADED" });
    }

    const f = fileFields(req.file);
    // Keep the earlier file if this resubmission doesn't include a new one.
    const keepOld = existing && !req.file;
    await db.query(
      `INSERT INTO submissions (assignment_id, student_id, text_answer, file_name, original_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE text_answer = VALUES(text_answer), submitted_at = NOW()
         ${keepOld ? "" : ", file_name = VALUES(file_name), original_name = VALUES(original_name), mime_type = VALUES(mime_type), size_bytes = VALUES(size_bytes)"}`,
      [row.id, req.user.id, textAnswer, f.file_name, f.original_name, f.mime_type, f.size_bytes]
    );
    if (existing && req.file) deleteUpload(existing.file_name);

    const [[saved]] = await db.query("SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?", [row.id, req.user.id]);
    res.status(existing ? 200 : 201).json({ submission: out.submission(saved) });
  } catch (err) {
    deleteUpload(req.file?.filename);
    throw err;
  }
});

// --- Quizzes --------------------------------------------------------------------------

// GET /api/learn/quizzes/:id — a published teacher quiz, without the answers.
router.get("/quizzes/:id", async (req, res) => {
  const row = await loadForStudent(req, res, "class_quizzes");
  if (!row) return;
  if (!row.published) return res.status(404).json({ error: "That quiz isn't available." });
  const [attempts] = await db.query(
    "SELECT score, total, created_at FROM quiz_attempts WHERE student_id = ? AND quiz_key = ? ORDER BY created_at DESC",
    [req.user.id, `class:${row.id}`]
  );
  res.json({ quiz: out.classQuiz(row, { forStudent: true }), attempts });
});

// POST /api/learn/quizzes/:id/attempts — { answers: { q1: "b", ... } }.
// Graded here so the correct answers never reach the browser before submitting.
router.post("/quizzes/:id/attempts", async (req, res) => {
  const row = await loadForStudent(req, res, "class_quizzes");
  if (!row) return;
  if (!row.published) return res.status(404).json({ error: "That quiz isn't available." });

  const questions = parseJson(row.questions);
  const given = req.body?.answers ?? {};
  const answers = Object.fromEntries(questions.map((q) => [q.id, typeof given[q.id] === "string" ? given[q.id] : null]));
  const score = questions.filter((q) => answers[q.id] === q.correct).length;

  await db.query(
    "INSERT INTO quiz_attempts (student_id, course_slug, quiz_key, score, total, answers) VALUES (?, ?, ?, ?, ?, ?)",
    [req.user.id, row.course_slug, `class:${row.id}`, score, questions.length, JSON.stringify(answers)]
  );
  res.status(201).json({
    score,
    total: questions.length,
    results: questions.map((q) => ({
      id: q.id,
      chosen: answers[q.id],
      correct: q.correct,
      explanation: q.explanation,
    })),
  });
});

// POST /api/learn/courses/:slug/builtin-quizzes/:quizId/attempts — { score, total }.
// Records a built-in course quiz (graded in the browser) for progress and dashboards.
router.post("/courses/:slug/builtin-quizzes/:quizId/attempts", requireEnrolled, async (req, res) => {
  if (!isSlug(req.params.quizId)) throw badRequest("Unknown quiz.");
  const total = integer(req.body?.total, { min: 1, max: 200, label: "Total" });
  const score = integer(req.body?.score, { min: 0, max: total, label: "Score" });
  await db.query("INSERT INTO quiz_attempts (student_id, course_slug, quiz_key, score, total) VALUES (?, ?, ?, ?, ?)", [
    req.user.id,
    req.params.slug,
    `builtin:${req.params.quizId}`,
    score,
    total,
  ]);
  res.status(201).json({ ok: true });
});

export default router;
