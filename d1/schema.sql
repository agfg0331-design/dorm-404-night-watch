PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guestbook_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guestbook_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  voter_hash TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES guestbook_messages(id) ON DELETE CASCADE,
  UNIQUE (message_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS guestbook_messages_created_at ON guestbook_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS guestbook_votes_message_id ON guestbook_votes(message_id);
