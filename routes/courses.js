import { Router } from "express";
import { catalogDb } from "../db.js";
import { isSlug } from "../lib/classroom.js";
import { findCourse, loadQuiz, withoutAnswers } from "../lib/catalog.js";

// The course catalog, read from the data-model database (CATALOG_DB_NAME,
// learning_platform by default). Read-only and public: the same content
// the landing page shows to guests.
const router = Router();

const courseColumns = `
  c.id, c.slug, c.title, c.description, c.image_url, c.color, cat.name AS category,
  (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
  (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
  (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id AND q.origin = 'catalog' AND q.published) AS quiz_count`;

const course = (c) => ({
  id: c.id,
  slug: c.slug,
  title: c.title,
  description: c.description,
  category: c.category,
  imageUrl: c.image_url,
  color: c.color,
  moduleCount: c.module_count,
  lessonCount: c.lesson_count,
  quizCount: c.quiz_count,
});

// GET /api/courses — every published course, in catalog order.
router.get("/", async (req, res) => {
  const [rows] = await catalogDb.query(
    `SELECT ${courseColumns}
       FROM courses c JOIN categories cat ON cat.id = c.category_id
      WHERE c.status = 'published'
      ORDER BY c.position, c.id`
  );
  res.json({ courses: rows.map(course) });
});

// GET /api/courses/:id — one course with its modules and lessons in order,
// and its quizzes (titles only; questions are served separately).
// :id is the numeric id or the slug, since the site's links use slugs.
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const byId = /^\d+$/.test(id);
  if (!byId && !isSlug(id)) return notFound(res);

  const [[row]] = await catalogDb.query(
    `SELECT ${courseColumns}
       FROM courses c JOIN categories cat ON cat.id = c.category_id
      WHERE c.status = 'published' AND ${byId ? "c.id" : "c.slug"} = ?`,
    [id]
  );
  if (!row) return notFound(res);

  const [[modules], [lessons], [quizzes]] = await Promise.all([
    catalogDb.query("SELECT id, position, title, summary FROM modules WHERE course_id = ? ORDER BY position", [row.id]),
    catalogDb.query(
      "SELECT id, module_id, position, title, body, code, after_text, video_url FROM lessons WHERE course_id = ? ORDER BY position",
      [row.id]
    ),
    catalogDb.query(
      `SELECT q.id, q.slug, q.title, q.description,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
         FROM quizzes q
        WHERE q.course_id = ? AND q.origin = 'catalog' AND q.published
        ORDER BY q.id`,
      [row.id]
    ),
  ]);

  res.json({
    course: {
      ...course(row),
      modules: modules.map((m) => ({
        id: m.id,
        position: m.position,
        title: m.title,
        summary: m.summary,
        lessons: lessons
          .filter((l) => l.module_id === m.id)
          .map((l) => ({
            id: l.id,
            position: l.position, // 1-based across the whole course
            title: l.title,
            body: l.body,
            code: l.code,
            afterText: l.after_text,
            videoUrl: l.video_url,
          })),
      })),
      quizzes: quizzes.map((q) => ({
        id: q.id,
        slug: q.slug,
        title: q.title,
        description: q.description,
        questionCount: q.question_count,
      })),
    },
  });
});

// GET /api/courses/:id/quizzes/:quizId — a catalog quiz to take: questions
// and options, but never which option is correct or the explanations.
// Answers are checked by POST /api/learn/courses/:slug/builtin-quizzes/:quizId/grade.
router.get("/:id/quizzes/:quizId", async (req, res) => {
  const course = await findCourse(req.params.id);
  if (!course) return notFound(res);
  const quiz = await loadQuiz(course.id, req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found.", code: "QUIZ_NOT_FOUND" });
  res.json({ course, quiz: withoutAnswers(quiz) });
});

function notFound(res) {
  res.status(404).json({ error: "Course not found.", code: "COURSE_NOT_FOUND" });
}

export default router;
