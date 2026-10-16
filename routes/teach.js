import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../lib/session.js";
import {
  badRequest,
  canTeach,
  cleanQuestions,
  dateTime,
  httpUrl,
  integer,
  loadOwned,
  parseJson,
  requireTeacherOf,
  requiredText,
  taughtSlugs,
  text,
} from "../lib/classroom.js";
import { deleteUpload, fileFields, handleUpload, materialUpload } from "../lib/uploads.js";
import * as out from "../lib/serialize.js";

// Everything a teacher does for the courses they teach. Admins can use it for any course.
const router = Router();
router.use(requireAuth, requireRole("teacher", "admin"));

const inList = (slugs) => (slugs.length ? slugs : ["__none__"]);

// GET /api/teach/overview — numbers and to-dos across all the teacher's courses.
router.get("/overview", async (req, res) => {
  const slugs = await taughtSlugs(req.user);
  const list = inList(slugs);

  const [[students]] = await db.query("SELECT COUNT(DISTINCT student_id) AS n FROM enrollments WHERE course_slug IN (?)", [list]);
  const [[toGrade]] = await db.query(
    `SELECT COUNT(*) AS n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
     WHERE a.course_slug IN (?) AND s.grade IS NULL`,
    [list]
  );
  const [[materials]] = await db.query("SELECT COUNT(*) AS n FROM materials WHERE course_slug IN (?)", [list]);
  const [[quizAvg]] = await db.query(
    "SELECT AVG(score / total) AS avg, COUNT(*) AS n FROM quiz_attempts WHERE course_slug IN (?) AND total > 0",
    [list]
  );
  const [upcoming] = await db.query(
    `SELECT * FROM live_sessions WHERE course_slug IN (?) AND starts_at + INTERVAL duration_min MINUTE >= NOW()
     ORDER BY starts_at LIMIT 5`,
    [list]
  );
  const [recentSubmissions] = await db.query(
    `SELECT s.*, u.name AS student_name, a.title AS assignment_title, a.course_slug, a.max_points
     FROM submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN users u ON u.id = s.student_id
     WHERE a.course_slug IN (?) ORDER BY s.submitted_at DESC LIMIT 6`,
    [list]
  );
  const [dueSoon] = await db.query(
    `SELECT a.*, (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_slug = a.course_slug) AS enrolled
     FROM assignments a WHERE a.course_slug IN (?) AND a.due_at >= NOW() ORDER BY a.due_at LIMIT 5`,
    [list]
  );
  const [perCourse] = await db.query(
    `SELECT e.course_slug, COUNT(*) AS students FROM enrollments e WHERE e.course_slug IN (?) GROUP BY e.course_slug`,
    [list]
  );
  const [perCourseQuiz] = await db.query(
    `SELECT course_slug, AVG(score / total) AS avg FROM quiz_attempts WHERE course_slug IN (?) AND total > 0 GROUP BY course_slug`,
    [list]
  );

  const studentsBy = Object.fromEntries(perCourse.map((r) => [r.course_slug, r.students]));
  const quizBy = Object.fromEntries(perCourseQuiz.map((r) => [r.course_slug, Number(r.avg)]));

  res.json({
    courses: slugs.map((slug) => ({ slug, students: studentsBy[slug] ?? 0, quizAverage: quizBy[slug] ?? null })),
    totals: {
      students: students.n,
      toGrade: toGrade.n,
      materials: materials.n,
      quizAverage: quizAvg.n ? Number(quizAvg.avg) : null,
      quizAttempts: quizAvg.n,
    },
    upcomingSessions: upcoming.map(out.liveSession),
    recentSubmissions: recentSubmissions.map((s) => ({
      ...out.submission(s),
      assignmentTitle: s.assignment_title,
      courseSlug: s.course_slug,
      maxPoints: s.max_points,
    })),
    dueSoon: dueSoon.map((a) => ({ ...out.assignment(a), submitted: a.submitted, enrolled: a.enrolled })),
  });
});

// GET /api/teach/courses/:slug — everything about one course for its teacher.
router.get("/courses/:slug", requireTeacherOf, async (req, res) => {
  const { slug } = req.params;

  const [students] = await db.query(
    `SELECT u.id, u.name, u.email, e.enrolled_at,
       (SELECT COUNT(*) FROM lesson_progress p WHERE p.student_id = u.id AND p.course_slug = e.course_slug) AS lessons_done,
       (SELECT AVG(score / total) FROM quiz_attempts q WHERE q.student_id = u.id AND q.course_slug = e.course_slug AND total > 0) AS quiz_avg,
       (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id
          WHERE s.student_id = u.id AND a.course_slug = e.course_slug) AS submissions
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.course_slug = ? ORDER BY u.name`,
    [slug]
  );
  const [teachers] = await db.query(
    "SELECT u.id, u.name, u.email FROM course_teachers t JOIN users u ON u.id = t.teacher_id WHERE t.course_slug = ? ORDER BY u.name",
    [slug]
  );
  const [materials] = await db.query("SELECT * FROM materials WHERE course_slug = ? ORDER BY created_at DESC, id DESC", [slug]);
  const [announcements] = await db.query(
    `SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.course_slug = ? ORDER BY a.created_at DESC, a.id DESC`,
    [slug]
  );
  const [assignments] = await db.query(
    `SELECT a.*,
       (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted,
       (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.grade IS NULL) AS to_grade
     FROM assignments a WHERE a.course_slug = ? ORDER BY a.due_at`,
    [slug]
  );
  const [quizzes] = await db.query(
    `SELECT q.*, (SELECT COUNT(*) FROM quiz_attempts t WHERE t.quiz_key = CONCAT('class:', q.id)) AS attempts,
       (SELECT AVG(score / total) FROM quiz_attempts t WHERE t.quiz_key = CONCAT('class:', q.id) AND total > 0) AS avg_score
     FROM class_quizzes q WHERE q.course_slug = ? ORDER BY q.created_at DESC`,
    [slug]
  );
  const [sessions] = await db.query("SELECT * FROM live_sessions WHERE course_slug = ? ORDER BY starts_at DESC", [slug]);
  const [builtinQuizzes] = await db.query(
    `SELECT quiz_key, COUNT(*) AS attempts, AVG(score / total) AS avg_score FROM quiz_attempts
     WHERE course_slug = ? AND quiz_key LIKE 'builtin:%' AND total > 0 GROUP BY quiz_key`,
    [slug]
  );

  res.json({
    slug,
    teachers,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      enrolledAt: s.enrolled_at,
      lessonsDone: s.lessons_done,
      quizAverage: s.quiz_avg === null ? null : Number(s.quiz_avg),
      submissions: s.submissions,
    })),
    materials: materials.map(out.material),
    announcements: announcements.map(out.announcement),
    assignments: assignments.map((a) => ({ ...out.assignment(a), submitted: a.submitted, toGrade: a.to_grade })),
    quizzes: quizzes.map((q) => ({
      ...out.classQuiz(q),
      attempts: q.attempts,
      averageScore: q.avg_score === null ? null : Number(q.avg_score),
    })),
    builtinQuizResults: builtinQuizzes.map((b) => ({
      quizId: b.quiz_key.slice("builtin:".length),
      attempts: b.attempts,
      averageScore: Number(b.avg_score),
    })),
    sessions: sessions.map(out.liveSession),
  });
});

// --- Materials ---------------------------------------------------------------

// POST /api/teach/courses/:slug/materials — multipart form: title, description,
// and either a file (any document or video) or a url.
router.post("/courses/:slug/materials", requireTeacherOf, handleUpload(materialUpload), async (req, res) => {
  try {
    const title = requiredText(req.body?.title, { max: 200, label: "A title" });
    const description = text(req.body?.description, { max: 5000, label: "Description" });
    let kind;
    let url = null;
    if (req.file) {
      kind = req.file.mimetype.startsWith("video/") ? "video" : "file";
    } else if (req.body?.url) {
      kind = "link";
      url = httpUrl(req.body.url, "The link");
    } else {
      throw badRequest("Attach a file or add a link.");
    }
    const f = fileFields(req.file);
    const [result] = await db.query(
      `INSERT INTO materials (course_slug, title, description, kind, file_name, original_name, mime_type, size_bytes, url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.slug, title, description, kind, f.file_name, f.original_name, f.mime_type, f.size_bytes, url, req.user.id]
    );
    const [[row]] = await db.query("SELECT * FROM materials WHERE id = ?", [result.insertId]);
    res.status(201).json({ material: out.material(row) });
  } catch (err) {
    deleteUpload(req.file?.filename); // don't keep a file for a material that wasn't saved
    throw err;
  }
});

router.delete("/materials/:id", async (req, res) => {
  const row = await loadOwned(req, res, "materials");
  if (!row) return;
  await db.query("DELETE FROM materials WHERE id = ?", [row.id]);
  deleteUpload(row.file_name);
  res.json({ ok: true });
});

// --- Announcements -------------------------------------------------------------

router.post("/courses/:slug/announcements", requireTeacherOf, async (req, res) => {
  const title = requiredText(req.body?.title, { max: 200, label: "A title" });
  const body = requiredText(req.body?.body, { max: 10000, label: "The announcement" });
  const [result] = await db.query(
    "INSERT INTO announcements (course_slug, title, body, created_by) VALUES (?, ?, ?, ?)",
    [req.params.slug, title, body, req.user.id]
  );
  const [[row]] = await db.query(
    "SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.created_by WHERE a.id = ?",
    [result.insertId]
  );
  res.status(201).json({ announcement: out.announcement(row) });
});

router.delete("/announcements/:id", async (req, res) => {
  const row = await loadOwned(req, res, "announcements");
  if (!row) return;
  await db.query("DELETE FROM announcements WHERE id = ?", [row.id]);
  res.json({ ok: true });
});

// --- Assignments and grading ----------------------------------------------------

function assignmentInput(body) {
  return {
    title: requiredText(body?.title, { max: 200, label: "A title" }),
    instructions: requiredText(body?.instructions, { max: 20000, label: "Instructions" }),
    dueAt: dateTime(body?.dueAt, "A due date"),
    maxPoints: integer(body?.maxPoints, { min: 1, max: 1000, label: "Points", fallback: 100 }),
  };
}

router.post("/courses/:slug/assignments", requireTeacherOf, async (req, res) => {
  const a = assignmentInput(req.body);
  const [result] = await db.query(
    "INSERT INTO assignments (course_slug, title, instructions, due_at, max_points, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [req.params.slug, a.title, a.instructions, a.dueAt, a.maxPoints, req.user.id]
  );
  const [[row]] = await db.query("SELECT * FROM assignments WHERE id = ?", [result.insertId]);
  res.status(201).json({ assignment: out.assignment(row) });
});

router.patch("/assignments/:id", async (req, res) => {
  const row = await loadOwned(req, res, "assignments");
  if (!row) return;
  const a = assignmentInput(req.body);
  await db.query("UPDATE assignments SET title = ?, instructions = ?, due_at = ?, max_points = ? WHERE id = ?", [
    a.title,
    a.instructions,
    a.dueAt,
    a.maxPoints,
    row.id,
  ]);
  const [[updated]] = await db.query("SELECT * FROM assignments WHERE id = ?", [row.id]);
  res.json({ assignment: out.assignment(updated) });
});

router.delete("/assignments/:id", async (req, res) => {
  const row = await loadOwned(req, res, "assignments");
  if (!row) return;
  const [files] = await db.query("SELECT file_name FROM submissions WHERE assignment_id = ?", [row.id]);
  await db.query("DELETE FROM assignments WHERE id = ?", [row.id]); // submissions cascade
  files.forEach((f) => deleteUpload(f.file_name));
  res.json({ ok: true });
});

// GET /api/teach/assignments/:id/submissions — every enrolled student, with
// their submission if they've handed one in.
router.get("/assignments/:id/submissions", async (req, res) => {
  const row = await loadOwned(req, res, "assignments");
  if (!row) return;
  const [rows] = await db.query(
    `SELECT u.id AS sid, u.name AS student_name, u.email AS student_email, s.*
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     LEFT JOIN submissions s ON s.assignment_id = ? AND s.student_id = u.id
     WHERE e.course_slug = ?
     UNION
     SELECT u.id AS sid, u.name, u.email, s.*
     FROM submissions s JOIN users u ON u.id = s.student_id
     WHERE s.assignment_id = ? AND s.student_id NOT IN (SELECT student_id FROM enrollments WHERE course_slug = ?)
     ORDER BY student_name`,
    [row.id, row.course_slug, row.id, row.course_slug]
  );
  res.json({
    assignment: out.assignment(row),
    students: rows.map((r) => ({
      studentId: r.sid,
      name: r.student_name,
      email: r.student_email,
      submission: r.id ? out.submission(r) : null,
    })),
  });
});

// PATCH /api/teach/submissions/:id — grade and feedback.
router.patch("/submissions/:id", async (req, res) => {
  const [[sub]] = await db.query(
    "SELECT s.*, a.course_slug, a.max_points FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?",
    [req.params.id]
  );
  if (!sub) return res.status(404).json({ error: "That submission no longer exists." });
  if (!(await canTeach(req.user, sub.course_slug))) {
    return res.status(403).json({ error: "You don't teach this course.", code: "FORBIDDEN" });
  }

  const grade = integer(req.body?.grade, { min: 0, max: sub.max_points, label: "The grade" });
  const feedback = text(req.body?.feedback, { max: 10000, label: "Feedback" });
  await db.query("UPDATE submissions SET grade = ?, feedback = ?, graded_at = NOW(), graded_by = ? WHERE id = ?", [
    grade,
    feedback,
    req.user.id,
    sub.id,
  ]);
  const [[updated]] = await db.query("SELECT * FROM submissions WHERE id = ?", [sub.id]);
  res.json({ submission: out.submission(updated) });
});

// --- Teacher-written quizzes ----------------------------------------------------

// Quizzes are quick checks; tests are timed and usually allow one attempt.
function quizInput(body) {
  const kind = body?.kind === "test" ? "test" : "quiz";
  const blank = (v) => v === undefined || v === null || v === "";
  return {
    kind,
    title: requiredText(body?.title, { max: 200, label: "A title" }),
    description: text(body?.description, { max: 5000, label: "Description" }),
    dueAt: dateTime(body?.dueAt, "Due date", { required: false }),
    questions: cleanQuestions(body?.questions),
    published: Boolean(body?.published),
    timeLimitMin:
      kind === "test" ? integer(body?.timeLimitMin, { min: 1, max: 600, label: "Time limit (minutes)", fallback: 30 }) : null,
    maxAttempts: blank(body?.maxAttempts)
      ? kind === "test"
        ? 1
        : null
      : integer(body.maxAttempts, { min: 1, max: 50, label: "Attempts allowed" }),
  };
}

router.post("/courses/:slug/quizzes", requireTeacherOf, async (req, res) => {
  const q = quizInput(req.body);
  const [result] = await db.query(
    "INSERT INTO class_quizzes (course_slug, kind, title, description, due_at, questions, published, time_limit_min, max_attempts, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [req.params.slug, q.kind, q.title, q.description, q.dueAt, JSON.stringify(q.questions), q.published, q.timeLimitMin, q.maxAttempts, req.user.id]
  );
  const [[row]] = await db.query("SELECT * FROM class_quizzes WHERE id = ?", [result.insertId]);
  res.status(201).json({ quiz: out.classQuiz(row) });
});

router.patch("/quizzes/:id", async (req, res) => {
  const row = await loadOwned(req, res, "class_quizzes");
  if (!row) return;
  // Publishing or hiding only: { published }. Anything else replaces the quiz.
  if (Object.keys(req.body ?? {}).length === 1 && "published" in req.body) {
    await db.query("UPDATE class_quizzes SET published = ? WHERE id = ?", [Boolean(req.body.published), row.id]);
  } else {
    const q = quizInput(req.body);
    await db.query(
      "UPDATE class_quizzes SET kind = ?, title = ?, description = ?, due_at = ?, questions = ?, published = ?, time_limit_min = ?, max_attempts = ? WHERE id = ?",
      [q.kind, q.title, q.description, q.dueAt, JSON.stringify(q.questions), q.published, q.timeLimitMin, q.maxAttempts, row.id]
    );
  }
  const [[updated]] = await db.query("SELECT * FROM class_quizzes WHERE id = ?", [row.id]);
  res.json({ quiz: out.classQuiz(updated) });
});

router.delete("/quizzes/:id", async (req, res) => {
  const row = await loadOwned(req, res, "class_quizzes");
  if (!row) return;
  await db.query("DELETE FROM quiz_attempts WHERE quiz_key = ?", [`class:${row.id}`]);
  await db.query("DELETE FROM class_quizzes WHERE id = ?", [row.id]);
  res.json({ ok: true });
});

// GET /api/teach/quizzes/:id/results — each student's best and latest score.
router.get("/quizzes/:id/results", async (req, res) => {
  const row = await loadOwned(req, res, "class_quizzes");
  if (!row) return;
  const [attempts] = await db.query(
    `SELECT u.id, u.name, u.email, COUNT(*) AS attempts, MAX(t.score) AS best, MAX(t.total) AS total, MAX(t.created_at) AS last_at
     FROM quiz_attempts t JOIN users u ON u.id = t.student_id
     WHERE t.quiz_key = ? GROUP BY u.id ORDER BY u.name`,
    [`class:${row.id}`]
  );
  // How many students picked the right answer for each question (latest attempts).
  const [answerRows] = await db.query("SELECT answers FROM quiz_attempts WHERE quiz_key = ?", [`class:${row.id}`]);
  const questions = parseJson(row.questions);
  const correctCounts = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    correct: answerRows.filter((a) => parseJson(a.answers)?.[q.id] === q.correct).length,
    answered: answerRows.length,
  }));
  res.json({
    quiz: out.classQuiz(row),
    students: attempts.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      attempts: a.attempts,
      best: a.best,
      total: a.total,
      lastAt: a.last_at,
    })),
    questions: correctCounts,
  });
});

// --- Live sessions ---------------------------------------------------------------

function sessionInput(body) {
  return {
    title: requiredText(body?.title, { max: 200, label: "A title" }),
    description: text(body?.description, { max: 5000, label: "Description" }),
    startsAt: dateTime(body?.startsAt, "A start time"),
    durationMin: integer(body?.durationMin, { min: 5, max: 600, label: "Length in minutes", fallback: 60 }),
    meetingUrl: httpUrl(body?.meetingUrl, "The meeting link"),
  };
}

router.post("/courses/:slug/sessions", requireTeacherOf, async (req, res) => {
  const s = sessionInput(req.body);
  const [result] = await db.query(
    "INSERT INTO live_sessions (course_slug, title, description, starts_at, duration_min, meeting_url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [req.params.slug, s.title, s.description, s.startsAt, s.durationMin, s.meetingUrl, req.user.id]
  );
  const [[row]] = await db.query("SELECT * FROM live_sessions WHERE id = ?", [result.insertId]);
  res.status(201).json({ session: out.liveSession(row) });
});

router.patch("/sessions/:id", async (req, res) => {
  const row = await loadOwned(req, res, "live_sessions");
  if (!row) return;
  const s = sessionInput(req.body);
  await db.query(
    "UPDATE live_sessions SET title = ?, description = ?, starts_at = ?, duration_min = ?, meeting_url = ? WHERE id = ?",
    [s.title, s.description, s.startsAt, s.durationMin, s.meetingUrl, row.id]
  );
  const [[updated]] = await db.query("SELECT * FROM live_sessions WHERE id = ?", [row.id]);
  res.json({ session: out.liveSession(updated) });
});

// POST /api/teach/sessions/:id/end — end a live class now, so students stop
// seeing "Live now". Sets the length to the whole minutes elapsed so far.
router.post("/sessions/:id/end", async (req, res) => {
  const row = await loadOwned(req, res, "live_sessions");
  if (!row) return;
  await db.query(
    "UPDATE live_sessions SET duration_min = GREATEST(0, FLOOR(TIMESTAMPDIFF(SECOND, starts_at, NOW()) / 60)) WHERE id = ?",
    [row.id]
  );
  const [[updated]] = await db.query("SELECT * FROM live_sessions WHERE id = ?", [row.id]);
  res.json({ session: out.liveSession(updated) });
});

router.delete("/sessions/:id", async (req, res) => {
  const row = await loadOwned(req, res, "live_sessions");
  if (!row) return;
  await db.query("DELETE FROM live_sessions WHERE id = ?", [row.id]);
  res.json({ ok: true });
});

export default router;
