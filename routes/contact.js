import { Router } from "express";
import { db } from "../db.js";
import { getSessionUser } from "../lib/session.js";
import { cleanEmail, emailPattern } from "../lib/validate.js";

const router = Router();

// POST /api/contact — anyone can send a message; admins read them in the admin panel.
router.post("/", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = cleanEmail(req.body?.email);
  const topic = String(req.body?.topic ?? "").trim() || "Something else";
  const message = String(req.body?.message ?? "").trim();

  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (name.length > 100) return res.status(400).json({ error: "Name must be 100 characters or fewer." });
  if (!emailPattern.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (topic.length > 100) return res.status(400).json({ error: "Topic must be 100 characters or fewer." });
  if (message.length < 10) return res.status(400).json({ error: "Write at least 10 characters so we know how to help." });
  if (message.length > 5000) return res.status(400).json({ error: "Message must be 5000 characters or fewer." });

  const user = await getSessionUser(req);
  await db.query(
    "INSERT INTO contact_messages (user_id, name, email, topic, message) VALUES (?, ?, ?, ?, ?)",
    [user?.id ?? null, name, email, topic, message]
  );
  res.status(201).json({ ok: true });
});

export default router;
