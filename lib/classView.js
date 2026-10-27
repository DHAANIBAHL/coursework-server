import { db } from "../db.js";
import * as out from "./serialize.js";

// The class side of a course as a student sees it: the teacher's material,
// posted announcements, assignments, published quizzes and tests (without
// answers), and live sessions.
//
// `studentId` adds that student's own progress, submissions, and scores.
// Pass null for the teacher/admin "student view" preview, which shows a
// brand-new student's view of the same content.
export async function studentClassView(slug, studentId) {
  const [teachers] = await db.query(
    "SELECT u.name FROM course_teachers t JOIN users u ON u.id = t.teacher_id WHERE t.course_slug = ? ORDER BY u.name",
    [slug]
  );
  const [materials] = await db.query("SELECT * FROM materials WHERE course_slug = ? ORDER BY created_at DESC, id DESC", [slug]);
  const [announcements] = await db.query(
    `SELECT a.*, u.name AS author_name, (CASE a.related_type
         WHEN 'assignment' THEN (SELECT title FROM assignments WHERE id = a.related_id)
         WHEN 'quiz' THEN (SELECT title FROM class_quizzes WHERE id = a.related_id)
         WHEN 'session' THEN (SELECT title FROM live_sessions WHERE id = a.related_id)
         WHEN 'material' THEN (SELECT title FROM materials WHERE id = a.related_id)
       END) AS related_title
     FROM announcements a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.course_slug = ? AND a.publish_at <= NOW()
     ORDER BY a.pinned DESC, a.publish_at DESC, a.id DESC`,
    [slug]
  );
  const [assignments] = await db.query("SELECT * FROM assignments WHERE course_slug = ? ORDER BY due_at", [slug]);
  const [quizzes] = await db.query(
    "SELECT * FROM class_quizzes WHERE course_slug = ? AND published ORDER BY COALESCE(due_at, created_at)",
    [slug]
  );
  const [sessions] = await db.query("SELECT * FROM live_sessions WHERE course_slug = ? ORDER BY starts_at", [slug]);

  let progress = [];
  let mySubmissions = [];
  let myAttempts = [];
  if (studentId !== null) {
    [progress] = await db.query(
      "SELECT lesson_index FROM lesson_progress WHERE student_id = ? AND course_slug = ? ORDER BY lesson_index",
      [studentId, slug]
    );
    [mySubmissions] = await db.query(
      "SELECT s.* FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_slug = ? AND s.student_id = ?",
      [slug, studentId]
    );
    [myAttempts] = await db.query(
      "SELECT quiz_key, MAX(score) AS best, MAX(total) AS total, COUNT(*) AS attempts FROM quiz_attempts WHERE student_id = ? AND course_slug = ? GROUP BY quiz_key",
      [studentId, slug]
    );
  }

  const subBy = Object.fromEntries(mySubmissions.map((s) => [s.assignment_id, out.submission(s)]));
  const attemptBy = Object.fromEntries(myAttempts.map((a) => [a.quiz_key, { best: a.best, total: a.total, attempts: a.attempts }]));

  return {
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
  };
}
