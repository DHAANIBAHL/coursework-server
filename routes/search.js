import { Router } from "express";
import { catalogDb } from "../db.js";

// GET /api/search?q=flexbox — searches every published course, lesson and
// quiz in the catalog database. Public, like the catalog it reads.
const router = Router();

// Courses first, then lessons, then quizzes when scores tie.
const typeOrder = { course: 0, lesson: 1, quiz: 2 };

// One flat list of everything searchable. Each entry: { type, title,
// subtitle, to, text } where `text` is matched with lower priority
// (descriptions, lesson bodies) and never sent back.
async function loadEntries() {
  const [[courses], [lessons], [quizzes]] = await Promise.all([
    catalogDb.query(
      `SELECT c.id, c.slug, c.title, c.description, cat.name AS category,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
         FROM courses c JOIN categories cat ON cat.id = c.category_id
        WHERE c.status = 'published' ORDER BY c.position, c.id`
    ),
    catalogDb.query(
      `SELECT l.course_id, l.position, l.title, l.body, l.after_text
         FROM lessons l JOIN courses c ON c.id = l.course_id
        WHERE c.status = 'published' ORDER BY l.course_id, l.position`
    ),
    catalogDb.query(
      `SELECT q.course_id, q.slug, q.title, q.description
         FROM quizzes q JOIN courses c ON c.id = q.course_id
        WHERE c.status = 'published' AND q.origin = 'catalog' AND q.published ORDER BY q.course_id, q.id`
    ),
  ]);

  return courses.flatMap((course) => [
    {
      type: "course",
      title: course.title,
      subtitle: `${course.category} · ${course.lesson_count} lessons`,
      to: `/course/${course.slug}`,
      text: course.description,
    },
    ...lessons
      .filter((l) => l.course_id === course.id)
      .map((l) => ({
        type: "lesson",
        title: l.title,
        subtitle: `${course.title} · Lesson ${l.position}`,
        to: `/course/${course.slug}#lesson-${l.position}`,
        text: `${l.body} ${l.after_text ?? ""}`,
      })),
    ...quizzes
      .filter((q) => q.course_id === course.id)
      .map((q) => ({
        type: "quiz",
        title: q.title,
        subtitle: `${course.title} · Quiz`,
        to: `/course/${course.slug}/quiz/${q.slug}`,
        text: q.description ?? "",
      })),
  ]);
}

// Every word in the query must appear somewhere in the entry; matches in the
// title rank above the subtitle, which ranks above the text.
function rank(entries, query, limit) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const results = [];
  for (const entry of entries) {
    const title = entry.title.toLowerCase();
    const subtitle = entry.subtitle.toLowerCase();
    const text = entry.text.toLowerCase();

    let score = 0;
    let allFound = true;
    for (const word of words) {
      if (title.startsWith(word)) score += 6;
      else if (title.includes(word)) score += 4;
      else if (subtitle.includes(word)) score += 2;
      else if (text.includes(word)) score += 1;
      else {
        allFound = false;
        break;
      }
    }
    if (allFound) results.push({ entry, score });
  }

  return results
    .sort((a, b) => b.score - a.score || typeOrder[a.entry.type] - typeOrder[b.entry.type])
    .slice(0, limit)
    .map(({ entry: { type, title, subtitle, to } }) => ({ type, title, subtitle, to }));
}

router.get("/", async (req, res) => {
  const query = String(req.query.q ?? "").slice(0, 200);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  if (!query.trim()) return res.json({ results: [] });
  res.json({ results: rank(await loadEntries(), query, limit) });
});

export default router;
