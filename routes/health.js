import { Router } from "express";
import { catalogDb } from "../db.js";
import { requireAuth, requireRole } from "../lib/session.js";

const router = Router();

// GET /api/health — is the server up? Public.
router.get("/", (req, res) => {
  res.json({ ok: true });
});

// GET /api/health/data-source — where the course catalog is read from, with
// live counts and how long the query took. Admins only (Admin → Overview).
router.get("/data-source", requireAuth, requireRole("admin"), async (req, res) => {
  const started = process.hrtime.bigint();
  const [[row]] = await catalogDb.query(
    `SELECT DATABASE() AS db,
            (SELECT COUNT(*) FROM courses) AS courses,
            (SELECT COUNT(*) FROM modules) AS modules,
            (SELECT COUNT(*) FROM lessons) AS lessons,
            (SELECT COUNT(*) FROM quizzes) AS quizzes`
  );
  const queryMs = Number(process.hrtime.bigint() - started) / 1e6;
  res.json({
    database: row.db,
    counts: { courses: row.courses, modules: row.modules, lessons: row.lessons, quizzes: row.quizzes },
    queryMs: Math.round(queryMs * 10) / 10,
    checkedAt: new Date().toISOString(),
  });
});

export default router;
