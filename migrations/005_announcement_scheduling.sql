-- Scheduled and draft announcements, categories, links to related items, pins.
-- publish_at: NULL = draft; in the future = scheduled; in the past = posted.
ALTER TABLE announcements
  ADD COLUMN publish_at   DATETIME NULL,
  ADD COLUMN category     ENUM('general', 'assignment', 'quiz', 'test', 'live', 'video', 'material') NOT NULL DEFAULT 'general',
  ADD COLUMN related_type ENUM('assignment', 'quiz', 'session', 'material') NULL,
  ADD COLUMN related_id   INT NULL,
  ADD COLUMN pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX (course_slug, publish_at);

-- Everything posted before this change stays posted, at its original time.
UPDATE announcements SET publish_at = created_at WHERE publish_at IS NULL;
