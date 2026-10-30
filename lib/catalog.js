import { catalogDb } from "../db.js";
import { isSlug } from "./classroom.js";

// Reads from the course catalog database (see routes/courses.js).

// A published course by numeric id or slug, or null.
export async function findCourse(idOrSlug) {
  const byId = /^\d+$/.test(String(idOrSlug));
  if (!byId && !isSlug(idOrSlug)) return null;
  const [[course]] = await catalogDb.query(
    `SELECT id, slug, title FROM courses WHERE status = 'published' AND ${byId ? "id" : "slug"} = ?`,
    [idOrSlug]
  );
  return course ?? null;
}

// One of a course's catalog quizzes with its questions and options, or null.
// Each option carries `isCorrect` and each question its `explanation`: only
// the grading endpoint may send those to the browser.
export async function loadQuiz(courseId, quizSlug) {
  if (!isSlug(quizSlug)) return null;
  const [quizzes] = await catalogDb.query(
    "SELECT id, slug, title, description FROM quizzes WHERE course_id = ? AND origin = 'catalog' AND published ORDER BY id",
    [courseId]
  );
  const index = quizzes.findIndex((q) => q.slug === quizSlug);
  if (index === -1) return null;
  const quiz = quizzes[index];

  const [[questions], [options]] = await Promise.all([
    catalogDb.query("SELECT id, position, prompt, explanation FROM quiz_questions WHERE quiz_id = ? ORDER BY position", [quiz.id]),
    catalogDb.query(
      `SELECT o.id, o.question_id, o.position, o.text, o.is_correct
         FROM quiz_options o JOIN quiz_questions q ON q.id = o.question_id
        WHERE q.quiz_id = ? ORDER BY o.question_id, o.position`,
      [quiz.id]
    ),
  ]);

  const next = quizzes[index + 1];
  return {
    id: quiz.id,
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    number: index + 1, // "Quiz 2 of 3"
    count: quizzes.length,
    next: next ? { slug: next.slug, title: next.title } : null,
    questions: questions.map((q) => ({
      id: q.id,
      position: q.position,
      prompt: q.prompt,
      explanation: q.explanation,
      options: options
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: o.id, position: o.position, text: o.text, isCorrect: Boolean(o.is_correct) })),
    })),
  };
}

// The quiz as the browser may see it before grading: no answers, no explanations.
export function withoutAnswers(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map(({ explanation, ...q }) => ({
      ...q,
      options: q.options.map(({ isCorrect, ...o }) => o),
    })),
  };
}

// Grades `answers` ({ [questionId]: optionId }). An unanswered question, or an
// option that isn't one of that question's, counts as wrong.
export function grade(quiz, answers) {
  const results = quiz.questions.map((q) => {
    const chosen = q.options.find((o) => o.id === Number(answers?.[q.id])) ?? null;
    const correct = q.options.find((o) => o.isCorrect);
    return {
      questionId: q.id,
      chosenOptionId: chosen?.id ?? null,
      correctOptionId: correct?.id ?? null,
      correct: Boolean(chosen?.isCorrect),
      explanation: q.explanation,
    };
  });
  return { score: results.filter((r) => r.correct).length, total: results.length, results };
}
