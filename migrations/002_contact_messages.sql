-- Messages sent from the website's Contact page, read by admins.
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,                -- set when the sender was logged in
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  topic      VARCHAR(100) NOT NULL,
  message    TEXT NOT NULL,
  handled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
