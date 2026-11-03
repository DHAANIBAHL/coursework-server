import { Router } from "express";
import { catalogDb, db } from "../db.js";
import { VISIBLE_QUIZ } from "../lib/catalog.js";
import { requireAuth, requireRole } from "../lib/session.js";

const router = Router();

// GET /api/health — is the server up? Public.
router.get("/", (req, res) => {
  res.json({ ok: true });
});

const PUBLISHED = "SELECT id FROM courses WHERE status = 'published'";

// GET /api/health/data-source — where the course catalog is read from, with
// live counts and how long the query took. Admins only (Admin → Overview).
// `counts` is what the site shows (published courses and what's in them);
// `totals` is every row, drafts and archived courses included.
router.get("/data-source", requireAuth, requireRole("admin"), async (req, res) => {
  const started = process.hrtime.bigint();
  const [[row]] = await catalogDb.query(
    `SELECT DATABASE() AS db,
            (SELECT COUNT(*) FROM courses WHERE status = 'published') AS courses,
            (SELECT COUNT(*) FROM modules WHERE course_id IN (${PUBLISHED})) AS modules,
            (SELECT COUNT(*) FROM lessons WHERE course_id IN (${PUBLISHED})) AS lessons,
            (SELECT COUNT(*) FROM quizzes q WHERE q.course_id IN (${PUBLISHED}) AND ${VISIBLE_QUIZ}) AS quizzes,
            (SELECT COUNT(*) FROM courses) AS all_courses,
            (SELECT COUNT(*) FROM modules) AS all_modules,
            (SELECT COUNT(*) FROM lessons) AS all_lessons,
            (SELECT COUNT(*) FROM quizzes) AS all_quizzes`
  );
  const queryMs = Number(process.hrtime.bigint() - started) / 1e6;
  res.json({
    database: row.db,
    counts: { courses: row.courses, modules: row.modules, lessons: row.lessons, quizzes: row.quizzes },
    totals: { courses: row.all_courses, modules: row.all_modules, lessons: row.all_lessons, quizzes: row.all_quizzes },
    queryMs: Math.round(queryMs * 10) / 10,
    checkedAt: new Date().toISOString(),
  });
});

// GET /api/health/data-flow — checks that the catalog database and the live
// database still fit together. The live database refers to courses and
// quizzes by slug and to lessons by position, so nothing in MySQL stops them
// drifting apart (a course unpublished, lessons removed, a quiz renamed).
// Each check: { id, level: "error" | "warning", title, help, count, examples }.
// The databases are read separately and compared here, so this works even if
// they live on different servers. Admins only (Admin → Overview).
router.get("/data-flow", requireAuth, requireRole("admin"), async (req, res) => {
  const started = process.hrtime.bigint();
  const [[courses], [quizzes], [badQuestions], [emptyModules]] = await Promise.all([
    catalogDb.query(
      `SELECT c.slug, c.status, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count FROM courses c`
    ),
    catalogDb.query(
      `SELECT c.slug AS course, q.slug, q.published,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questions
         FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE q.origin = 'catalog'`
    ),
    catalogDb.query(
      `SELECT c.slug AS course, q.slug AS quiz, qq.position, SUM(COALESCE(o.is_correct, 0)) AS correct
         FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id JOIN courses c ON c.id = q.course_id
         LEFT JOIN quiz_options o ON o.question_id = qq.id
        GROUP BY qq.id HAVING correct <> 1`
    ),
    catalogDb.query(
      `SELECT c.slug AS course, m.position, m.title FROM modules m JOIN courses c ON c.id = m.course_id
        WHERE c.status = 'published' AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.module_id = m.id)`
    ),
  ]);
  const [[enrollments], [progress], [teachers], [scores], [classroom]] = await Promise.all([
    db.query("SELECT course_slug AS course, COUNT(*) AS n FROM enrollments GROUP BY course_slug"),
    db.query("SELECT course_slug AS course, lesson_index, COUNT(*) AS n FROM lesson_progress GROUP BY course_slug, lesson_index"),
    db.query("SELECT course_slug AS course, COUNT(*) AS n FROM course_teachers GROUP BY course_slug"),
    db.query(
      `SELECT course_slug AS course, SUBSTRING(quiz_key, 9) AS quiz, total, COUNT(*) AS n
         FROM quiz_attempts WHERE quiz_key LIKE 'builtin:%' GROUP BY course_slug, quiz_key, total`
    ),
    db.query(
      `SELECT course_slug AS course, 'materials' AS what, COUNT(*) AS n FROM materials GROUP BY course_slug
       UNION ALL SELECT course_slug, 'assignments', COUNT(*) FROM assignments GROUP BY course_slug
       UNION ALL SELECT course_slug, 'quizzes and tests', COUNT(*) FROM class_quizzes GROUP BY course_slug
       UNION ALL SELECT course_slug, 'announcements', COUNT(*) FROM announcements GROUP BY course_slug
       UNION ALL SELECT course_slug, 'live classes', COUNT(*) FROM live_sessions GROUP BY course_slug`
    ),
  ]);

  const published = new Map(courses.filter((c) => c.status === "published").map((c) => [c.slug, c]));
  const shownQuiz = new Map(
    quizzes.filter((q) => published.has(q.course) && q.published && q.questions > 0).map((q) => [`${q.course}/${q.slug}`, q])
  );
  const missing = (rows) => rows.filter((r) => !published.has(r.course));
  const sum = (rows) => rows.reduce((total, r) => total + Number(r.n ?? 1), 0);
  const list = (rows, describe) => rows.slice(0, 5).map(describe);
  const why = (slug) => (courses.some((c) => c.slug === slug) ? `is ${courses.find((c) => c.slug === slug).status}` : "isn't in the catalog");

  const lostEnrollments = missing(enrollments);
  const lostProgress = missing(progress);
  const pastEnd = progress.filter((r) => published.has(r.course) && r.lesson_index >= published.get(r.course).lesson_count);
  const lostTeachers = missing(teachers);
  const lostScores = scores.filter((r) => !shownQuiz.has(`${r.course}/${r.quiz}`));
  const changedTotals = scores.filter((r) => shownQuiz.has(`${r.course}/${r.quiz}`) && r.total !== shownQuiz.get(`${r.course}/${r.quiz}`).questions);
  const lostClassroom = missing(classroom);
  const emptyQuizzes = quizzes.filter((q) => published.has(q.course) && q.published && q.questions === 0);

  const checks = [
    {
      id: "enrollments",
      level: "error",
      title: "Enrollments point at published courses",
      help: "Students who joined a course that has since been unpublished or removed from the catalog can't open it, but it still counts on their dashboard.",
      count: sum(lostEnrollments),
      examples: list(lostEnrollments, (r) => `${r.n} in "${r.course}", which ${why(r.course)}`),
    },
    {
      id: "progress-course",
      level: "error",
      title: "Lesson progress points at published courses",
      help: "Progress saved for a course that is no longer published.",
      count: sum(lostProgress),
      examples: list(lostProgress, (r) => `${r.n} for lesson ${r.lesson_index + 1} of "${r.course}", which ${why(r.course)}`),
    },
    {
      id: "progress-lesson",
      level: "error",
      title: "Lesson progress is within each course's lessons",
      help: "Progress is stored by lesson position. If lessons were removed from a course, saved progress past the new last lesson would overstate how far students got.",
      count: sum(pastEnd),
      examples: list(pastEnd, (r) => `${r.n} for lesson ${r.lesson_index + 1} of "${r.course}", which has ${published.get(r.course).lesson_count}`),
    },
    {
      id: "teachers",
      level: "error",
      title: "Teachers are assigned to published courses",
      help: "A teacher assigned to an unpublished or removed course loses it from the Teaching area.",
      count: sum(lostTeachers),
      examples: list(lostTeachers, (r) => `${r.n} teacher${r.n === 1 ? "" : "s"} on "${r.course}", which ${why(r.course)}`),
    },
    {
      id: "classroom",
      level: "error",
      title: "Classroom items belong to published courses",
      help: "Materials, assignments, teacher quizzes, announcements and live classes are stored by course slug.",
      count: sum(lostClassroom),
      examples: list(lostClassroom, (r) => `${r.n} ${r.what} in "${r.course}", which ${why(r.course)}`),
    },
    {
      id: "scores",
      level: "warning",
      title: "Built-in quiz scores point at quizzes the site shows",
      help: "Scores are stored as builtin:<quiz slug>. Renaming, unpublishing or emptying a quiz hides its past scores.",
      count: sum(lostScores),
      examples: list(lostScores, (r) => `${r.n} for "${r.course}/${r.quiz}"`),
    },
    {
      id: "score-totals",
      level: "warning",
      title: "Built-in quiz scores match each quiz's question count",
      help: "Scores out of a different number of questions were taken before the quiz changed; best-score comparisons mix the two.",
      count: sum(changedTotals),
      examples: list(changedTotals, (r) => `${r.n} out of ${r.total} for "${r.course}/${r.quiz}", which now has ${shownQuiz.get(`${r.course}/${r.quiz}`).questions}`),
    },
    {
      id: "correct-options",
      level: "error",
      title: "Every quiz question has exactly one correct option",
      help: "A question with no correct option can never be answered right; one with several is graded by whichever comes first.",
      count: badQuestions.length,
      examples: list(badQuestions, (r) => `"${r.course}/${r.quiz}" question ${r.position} has ${r.correct} correct options`),
    },
    {
      id: "empty-quizzes",
      level: "warning",
      title: "Published quizzes have questions",
      help: "Quizzes with no questions are hidden from the site until questions are added.",
      count: emptyQuizzes.length,
      examples: list(emptyQuizzes, (q) => `"${q.course}/${q.slug}"`),
    },
    {
      id: "empty-modules",
      level: "warning",
      title: "Modules in published courses have lessons",
      help: "An empty module shows as a heading with a \"no lessons yet\" note.",
      count: emptyModules.length,
      examples: list(emptyModules, (m) => `"${m.course}" module ${m.position}: ${m.title}`),
    },
  ];

  res.json({
    checks,
    problems: checks.filter((c) => c.count > 0).length,
    queryMs: Math.round((Number(process.hrtime.bigint() - started) / 1e6) * 10) / 10,
    checkedAt: new Date().toISOString(),
  });
});

export default router;
