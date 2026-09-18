const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Board-Visitor",
  "Cache-Control": "no-store"
};

export function boardJson(body, init = {}) {
  const headers = new Headers(init.headers);
  Object.entries(corsHeaders).forEach(([name, value]) => headers.set(name, value));
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function boardOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function database(env) {
  if (!env.DB) throw new Error("留言数据库尚未绑定。");
  return env.DB;
}

export async function ensureSchema(env) {
  const db = database(env);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS guestbook_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      content TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guestbook_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      voter_hash TEXT NOT NULL,
      value INTEGER NOT NULL CHECK (value IN (-1, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES guestbook_messages(id) ON DELETE CASCADE,
      UNIQUE (message_id, voter_hash)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS guestbook_messages_created_at ON guestbook_messages(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS guestbook_votes_message_id ON guestbook_votes(message_id)")
  ]);
  return db;
}

export async function visitorHash(request, bodyId = "") {
  const raw = request.headers.get("x-board-visitor") || bodyId || "anonymous";
  const source = `404-guestbook-v1:${String(raw).slice(0, 160)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s{3,}/g, "  ").trim().slice(0, max);
}

function contentError(content) {
  if (!content) return "留言不能为空。";
  if (content.length > 180) return "留言最多 180 个字。";
  if (/(https?:\/\/|www\.|javascript:|<script)/i.test(content)) return "留言中不能包含链接或脚本。";
  if (/(操你妈|草你妈|傻逼|去死)/i.test(content)) return "这条留言包含不合适的内容。";
  if (/(.)\1{11,}/u.test(content)) return "请不要重复刷屏。";
  return "";
}

export function boardError(error, fallback = "留言终端暂时离线。") {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("尚未绑定")) return message;
  return fallback;
}

export const onRequestOptions = () => boardOptions();

export async function onRequestGet({ request, env }) {
  try {
    const db = await ensureSchema(env);
    const sort = new URL(request.url).searchParams.get("sort") === "hot" ? "hot" : "latest";
    const order = sort === "hot"
      ? "(likes - dislikes) DESC, likes DESC, m.created_at DESC, m.id DESC"
      : "m.created_at DESC, m.id DESC";
    const query = `SELECT
      m.id,
      m.nickname,
      m.content,
      strftime('%Y-%m-%dT%H:%M:%SZ', m.created_at) AS createdAt,
      COALESCE(SUM(CASE WHEN v.value = 1 THEN 1 ELSE 0 END), 0) AS likes,
      COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes
      FROM guestbook_messages m
      LEFT JOIN guestbook_votes v ON v.message_id = m.id
      GROUP BY m.id
      ORDER BY ${order}
      LIMIT 50`;
    const { results = [] } = await db.prepare(query).all();
    const messages = results.map((row) => ({
      ...row,
      id: Number(row.id),
      likes: Number(row.likes || 0),
      dislikes: Number(row.dislikes || 0)
    }));
    const hash = await visitorHash(request);
    let votes = {};
    if (messages.length) {
      const placeholders = messages.map(() => "?").join(",");
      const own = await db.prepare(`SELECT message_id AS messageId, value FROM guestbook_votes WHERE voter_hash = ? AND message_id IN (${placeholders})`)
        .bind(hash, ...messages.map((message) => message.id)).all();
      votes = Object.fromEntries((own.results || []).map((vote) => [vote.messageId, Number(vote.value)]));
    }
    return boardJson({ messages, votes });
  } catch (error) {
    return boardJson({ error: boardError(error) }, { status: 503 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const nickname = cleanText(payload.nickname, 16);
    const content = cleanText(payload.content, 181);
    const invalid = contentError(content);
    if (!nickname) return boardJson({ error: "请填写昵称。" }, { status: 400 });
    if (invalid) return boardJson({ error: invalid }, { status: 400 });
    const hash = await visitorHash(request, payload.visitorId);
    const db = await ensureSchema(env);
    const recent = await db.prepare(`SELECT COUNT(*) AS count, MAX(created_at) AS latest
      FROM guestbook_messages
      WHERE visitor_hash = ? AND created_at > datetime('now', '-1 hour')`).bind(hash).first();
    if (Number(recent?.count || 0) >= 5) return boardJson({ error: "发送得太频繁了，请一小时后再试。" }, { status: 429 });
    if (recent?.latest) {
      const latest = new Date(`${String(recent.latest).replace(" ", "T")}Z`).getTime();
      if (Number.isFinite(latest) && Date.now() - latest < 30_000) return boardJson({ error: "请等 30 秒再发送下一条留言。" }, { status: 429 });
    }
    const inserted = await db.prepare("INSERT INTO guestbook_messages (nickname, content, visitor_hash) VALUES (?, ?, ?)")
      .bind(nickname, content, hash).run();
    const id = Number(inserted.meta?.last_row_id);
    const message = await db.prepare(`SELECT id, nickname, content,
      strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS createdAt
      FROM guestbook_messages WHERE id = ?`).bind(id).first();
    return boardJson({ message: { ...message, id, likes: 0, dislikes: 0 } }, { status: 201 });
  } catch (error) {
    return boardJson({ error: boardError(error, "留言写入失败。") }, { status: 503 });
  }
}
