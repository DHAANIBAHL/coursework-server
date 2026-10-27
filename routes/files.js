import path from "path";
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../lib/session.js";
import { canTeach, isEnrolled } from "../lib/classroom.js";
import { UPLOAD_DIR } from "../lib/uploads.js";

// Serves uploaded files, but only to people allowed to see them:
// - material: the course's students and teachers
// - submission: the student who sent it and the course's teachers
const router = Router();
router.use(requireAuth);

// Types that are safe to show in the browser. Anything else (HTML, SVG,
// scripts...) is always downloaded, so an uploaded file can't run code on
// this site.
const INLINE_TYPES = /^(video\/|audio\/|image\/(png|jpeg|gif|webp)$|application\/pdf$|text\/plain$)/;

function send(res, req, row) {
  if (!row.file_name) return res.status(404).json({ error: "That file no longer exists." });
  const inline = INLINE_TYPES.test(row.mime_type ?? "") && req.query.download === undefined;
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Cache-Control": "private, max-age=3600",
  });
  // Note: res.attachment() also sets Content-Type from the file extension,
  // so the type is set after it.
  const name = encodeURIComponent(row.original_name ?? "file");
  res.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`);
  res.type(inline ? row.mime_type : "application/octet-stream");
  // sendFile handles Range requests, so videos can be skipped through.
  res.sendFile(path.join(UPLOAD_DIR, path.basename(row.file_name)), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "That file no longer exists." });
  });
}

router.get("/material/:id", async (req, res) => {
  const [[row]] = await db.query("SELECT * FROM materials WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "That file no longer exists." });
  const allowed = (await canTeach(req.user, row.course_slug)) || (await isEnrolled(req.user.id, row.course_slug));
  if (!allowed) return res.status(403).json({ error: "Join this course to open its material.", code: "NOT_ENROLLED" });
  send(res, req, row);
});

router.get("/submission/:id", async (req, res) => {
  const [[row]] = await db.query(
    "SELECT s.*, a.course_slug FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?",
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: "That file no longer exists." });
  const allowed = row.student_id === req.user.id || (await canTeach(req.user, row.course_slug));
  if (!allowed) return res.status(403).json({ error: "You can't open this file.", code: "FORBIDDEN" });
  send(res, req, row);
});

export default router;
