import { boardError, boardJson, boardOptions, ensureSchema, visitorHash } from "../../board.js";

export const onRequestOptions = () => boardOptions();

export async function onRequestPost({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return boardJson({ error: "无效的留言编号。" }, { status: 400 });
  try {
    const payload = await request.json();
    const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
    if (!reason || reason.length > 80) return boardJson({ error: "请填写简短的举报原因。" }, { status: 400 });
    const db = await ensureSchema(env);
    if (!await db.prepare("SELECT id FROM guestbook_messages WHERE id = ?").bind(id).first()) {
      return boardJson({ error: "这条留言已经不存在。" }, { status: 404 });
    }
    const hash = await visitorHash(request, payload.visitorId);
    const recent = await db.prepare(`SELECT id FROM guestbook_reports WHERE message_id = ? AND visitor_hash = ?
      AND created_at > datetime('now', '-1 day')`).bind(id, hash).first();
    if (recent) return boardJson({ error: "这条留言今天已经举报过了。" }, { status: 429 });
    await db.prepare("INSERT INTO guestbook_reports (message_id, visitor_hash, reason) VALUES (?, ?, ?)")
      .bind(id, hash, reason).run();
    return boardJson({ reported: true }, { status: 201 });
  } catch (error) {
    return boardJson({ error: boardError(error, "举报暂时无法提交。") }, { status: 503 });
  }
}
