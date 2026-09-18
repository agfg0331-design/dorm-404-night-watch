import { boardError, boardJson, boardOptions, ensureSchema, visitorHash } from "../../board.js";

export const onRequestOptions = () => boardOptions();

export async function onRequestPost({ request, env, params }) {
  try {
    const messageId = Number(params.id);
    const payload = await request.json();
    const value = Number(payload.value);
    if (!Number.isInteger(messageId) || messageId < 1 || ![1, -1].includes(value)) {
      return boardJson({ error: "无效的投票。" }, { status: 400 });
    }
    const db = await ensureSchema(env);
    const message = await db.prepare("SELECT id FROM guestbook_messages WHERE id = ?").bind(messageId).first();
    if (!message) return boardJson({ error: "这条留言已经不存在。" }, { status: 404 });
    const voterHash = await visitorHash(request, payload.visitorId);
    await db.prepare(`INSERT INTO guestbook_votes (message_id, voter_hash, value)
      VALUES (?, ?, ?)
      ON CONFLICT(message_id, voter_hash)
      DO UPDATE SET value = excluded.value, created_at = CURRENT_TIMESTAMP`)
      .bind(messageId, voterHash, value).run();
    const counts = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS likes,
      COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS dislikes
      FROM guestbook_votes WHERE message_id = ?`).bind(messageId).first();
    return boardJson({ vote: value, likes: Number(counts?.likes || 0), dislikes: Number(counts?.dislikes || 0) });
  } catch (error) {
    return boardJson({ error: boardError(error, "投票失败。") }, { status: 503 });
  }
}
