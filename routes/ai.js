import { Router } from "express";
import { requireAuth, requireRole } from "../lib/session.js";
import { badRequest, canTeach, cleanQuestions, isSlug } from "../lib/classroom.js";
import { AiError, aiConfigured, aiInfo, chatJson } from "../lib/ai.js";

// The teacher's quiz assistant: a chat where teachers describe a topic and get
// multiple-choice questions back, ready to save as a draft quiz or test.
const router = Router();
router.use(requireAuth, requireRole("teacher", "admin"));

// Simple per-user limit so one teacher can't burn through the AI provider's quota.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const recent = new Map(); // userId -> [timestamps]
function rateLimited(userId) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  times.push(now);
  recent.set(userId, times);
  return times.length > MAX_PER_WINDOW;
}

const SYSTEM_PROMPT = `You are the quiz assistant for teachers on Coursework, an online course site.
You help teachers write multiple-choice quizzes and tests for their course.

Always answer with a single JSON object, and nothing else:
{
  "reply": "a short, friendly message to the teacher (1-3 sentences)",
  "quiz": null or {
    "title": "a short quiz title",
    "questions": [
      {
        "prompt": "the question",
        "options": ["option A", "option B", "option C", "option D"],
        "correctIndex": 0,
        "explanation": "one sentence on why the correct option is right"
      }
    ]
  }
}

Rules:
- When the teacher asks for questions or a quiz, fill "quiz". Otherwise (greetings, questions about what you can do) set "quiz" to null and answer in "reply".
- Default to 5 questions if no number is given; never more than 20.
- Each question has exactly 4 options, one correct answer, and plausible wrong answers.
- Vary which option is correct; don't always use the same position.
- Match the requested difficulty; if none is given, aim for beginners.
- Stay accurate. If a topic is ambiguous, pick the most likely meaning for the course and say so in "reply".
- When the teacher asks to change a quiz you made (harder, more questions, different focus), return the full updated quiz.
- Write code inline in the question text if needed; don't use Markdown.`;

function cleanMessages(value) {
  if (!Array.isArray(value) || value.length === 0) throw badRequest("Say what quiz you'd like.");
  const messages = value.slice(-12).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: String(m?.content ?? "").slice(0, 4000),
  }));
  if (!messages.at(-1).content.trim()) throw badRequest("Say what quiz you'd like.");
  return messages;
}

// GET /api/teach/ai/status — whether the assistant is configured, and with what.
router.get("/status", (req, res) => {
  res.json({ configured: aiConfigured(), ...aiInfo() });
});

// POST /api/teach/ai/quiz-chat — { courseSlug, courseTitle, lessonTitles, messages }
// Returns { reply, quiz: null | { title, questions } }.
router.post("/quiz-chat", async (req, res) => {
  const slug = String(req.body?.courseSlug ?? "");
  if (!isSlug(slug)) throw badRequest("Unknown course.");
  if (!(await canTeach(req.user, slug))) {
    return res.status(403).json({ error: "You don't teach this course.", code: "FORBIDDEN" });
  }
  if (rateLimited(req.user.id)) {
    return res.status(429).json({ error: "That's a lot of requests in a minute. Wait a moment and try again.", code: "AI_RATE_LIMITED" });
  }

  const messages = cleanMessages(req.body?.messages);
  const courseTitle = String(req.body?.courseTitle ?? "").slice(0, 200);
  const lessons = (Array.isArray(req.body?.lessonTitles) ? req.body.lessonTitles : []).slice(0, 40).map((t) => String(t).slice(0, 120));
  const context = `The teacher's course: "${courseTitle || slug}".${lessons.length ? ` Its lessons: ${lessons.join("; ")}.` : ""}`;

  try {
    // Assistant turns are sent back as the JSON the model produced earlier.
    const answer = await chatJson([{ role: "system", content: `${SYSTEM_PROMPT}\n\n${context}` }, ...messages]);
    const reply = String(answer?.reply ?? "").slice(0, 2000) || "Here you go.";
    let quiz = null;
    if (answer?.quiz?.questions?.length) {
      try {
        quiz = {
          title: String(answer.quiz.title ?? "").trim().slice(0, 200) || "AI-generated quiz",
          // The same checks as a teacher-written quiz, so nothing broken gets saved.
          questions: cleanQuestions(answer.quiz.questions.slice(0, 20)),
        };
      } catch {
        throw new AiError("The AI's questions weren't complete. Try asking again.");
      }
    }
    res.json({ reply, quiz });
  } catch (err) {
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message, code: err.code });
    throw err;
  }
});

export default router;
