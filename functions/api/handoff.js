import { boardError, boardJson, boardOptions, ensureSchema, visitorHash } from "./board.js";

export const onRequestOptions = () => boardOptions();

function cleanContent(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

function contentError(content) {
  if (!content) return "交班留言不能为空。";
  if (Array.from(content).length > 100) return "交班留言最多 100 个字。";
  if (/[<>]/.test(content) || /(javascript:|<script)/i.test(content)) return "交班留言中不能包含 HTML 或脚本。";
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|cn|net|org)\b)/i.test(content)) return "交班留言中不能包含网址。";
  if (/(操你妈|草你妈|傻逼|去死)/i.test(content)) return "这条留言包含不合适的内容。";
  if (/(.)\1{11,}/u.test(content)) return "请不要重复刷屏。";
  return "";
}

async function randomRecentMessage(db, hash) {
  const select = `SELECT content FROM (
    SELECT id, content, created_at
    FROM handoff_messages
    WHERE visitor_hash <> ? AND created_at >= datetime('now', '-30 days')
    ORDER BY created_at DESC, id DESC
    LIMIT 200
  ) ORDER BY RANDOM() LIMIT 1`;
  const recent = await db.prepare(select).bind(hash).first();
  if (recent) return recent;
  return db.prepare(`SELECT content FROM (
    SELECT id, content, created_at
    FROM handoff_messages
    WHERE visitor_hash <> ?
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  ) ORDER BY RANDOM() LIMIT 1`).bind(hash).first();
}

export async function onRequestGet({ request, env }) {
  try {
    const db = await ensureSchema(env);
    const hash = await visitorHash(request);
    const message = await randomRecentMessage(db, hash);
    return boardJson({ message: message ? { content: String(message.content) } : null });
  } catch (error) {
    return boardJson({ error: boardError(error, "交班记录暂时无法读取。") }, { status: 503 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const content = cleanContent(payload.content);
    const invalid = contentError(content);
    if (invalid) return boardJson({ error: invalid }, { status: 400 });
    const endingKind = ["dawn", "handoff", "watched"].includes(payload.endingKind) ? payload.endingKind : "";
    if (!endingKind) return boardJson({ error: "无效的值班结局。" }, { status: 400 });

    const hash = await visitorHash(request, payload.visitorId);
    const db = await ensureSchema(env);
    const recent = await db.prepare(`SELECT COUNT(*) AS count, MAX(created_at) AS latest
      FROM handoff_messages
      WHERE visitor_hash = ? AND created_at > datetime('now', '-1 hour')`).bind(hash).first();
    if (Number(recent?.count || 0) >= 4) return boardJson({ error: "交班留言发送得太频繁了，请稍后再试。" }, { status: 429 });
    if (recent?.latest) {
      const latest = new Date(`${String(recent.latest).replace(" ", "T")}Z`).getTime();
      if (Number.isFinite(latest) && Date.now() - latest < 30_000) return boardJson({ error: "请等 30 秒再留下新的交班留言。" }, { status: 429 });
    }

    const inserted = await db.prepare("INSERT INTO handoff_messages (content, ending_kind, visitor_hash) VALUES (?, ?, ?)")
      .bind(content, endingKind, hash).run();
    return boardJson({ saved: true, id: Number(inserted.meta?.last_row_id) }, { status: 201 });
  } catch (error) {
    return boardJson({ error: boardError(error, "交班留言写入失败。") }, { status: 503 });
  }
}
