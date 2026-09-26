import { boardError, boardJson, boardOptions, ensureSchema } from "../board.js";

export const onRequestOptions = () => boardOptions();

export async function onRequestDelete({ request, env, params }) {
  const token = env.BOARD_ADMIN_TOKEN;
  const supplied = request.headers.get("authorization") || "";
  if (!token || !/^Bearer .+$/i.test(supplied)) return boardJson({ error: "需要管理员授权。" }, { status: 401 });
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  const actual = new TextEncoder().encode(supplied);
  let difference = expected.length ^ actual.length;
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) difference |= (expected[i] || 0) ^ (actual[i] || 0);
  if (difference) return boardJson({ error: "管理员授权无效。" }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return boardJson({ error: "无效的留言编号。" }, { status: 400 });
  try {
    const db = await ensureSchema(env);
    const existing = await db.prepare("SELECT id FROM guestbook_messages WHERE id = ?").bind(id).first();
    if (!existing) return boardJson({ error: "这条留言已经不存在。" }, { status: 404 });
    await db.batch([
      db.prepare("DELETE FROM guestbook_votes WHERE message_id = ?").bind(id),
      db.prepare("DELETE FROM guestbook_reports WHERE message_id = ?").bind(id),
      db.prepare("DELETE FROM guestbook_post_ips WHERE message_id = ?").bind(id)
    ]);
    await db.prepare("DELETE FROM guestbook_messages WHERE id = ?").bind(id).run();
    return boardJson({ deleted: true, id });
  } catch (error) {
    return boardJson({ error: boardError(error, "删除留言失败。") }, { status: 503 });
  }
}
