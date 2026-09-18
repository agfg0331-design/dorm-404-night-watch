import { routeError, visitorHash, cleanText, contentError, boardDb, boardJson, boardOptions, messages, votes, and, desc, eq, inArray, sql } from "./shared";

function score() {
  return sql<number>`(
    SELECT COALESCE(SUM(CASE WHEN gv.value = 1 THEN 1 ELSE -1 END), 0)
    FROM guestbook_votes gv WHERE gv.message_id = ${messages.id}
  )`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sort = url.searchParams.get("sort") === "hot" ? "hot" : "latest";
    const db = boardDb();
    const likes = sql<number>`(SELECT COUNT(*) FROM guestbook_votes gv WHERE gv.message_id = ${messages.id} AND gv.value = 1)`;
    const dislikes = sql<number>`(SELECT COUNT(*) FROM guestbook_votes gv WHERE gv.message_id = ${messages.id} AND gv.value = -1)`;
    const query = db.select({ id: messages.id, nickname: messages.nickname, content: messages.content, createdAt: messages.createdAt, likes, dislikes }).from(messages);
    const rows = sort === "hot"
      ? await query.orderBy(desc(score()), desc(likes), desc(messages.createdAt), desc(messages.id)).limit(50)
      : await query.orderBy(desc(messages.createdAt), desc(messages.id)).limit(50);
    const hash = await visitorHash(request);
    const ownVotes = rows.length ? await db.select({ messageId: votes.messageId, value: votes.value }).from(votes).where(and(eq(votes.voterHash, hash), inArray(votes.messageId, rows.map((row) => row.id)))) : [];
    return boardJson({ messages: rows, votes: Object.fromEntries(ownVotes.map((vote) => [vote.messageId, vote.value])) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return boardJson({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { nickname?: string; content?: string; visitorId?: string };
    const nickname = cleanText(payload.nickname, 16);
    const content = cleanText(payload.content, 181);
    const invalid = contentError(content);
    if (!nickname) return boardJson({ error: "请填写昵称。" }, { status: 400 });
    if (invalid) return boardJson({ error: invalid }, { status: 400 });
    const hash = await visitorHash(request, payload.visitorId);
    const db = boardDb();
    const [recent] = await db.select({ count: sql<number>`count(*)`, latest: sql<string | null>`max(${messages.createdAt})` }).from(messages).where(and(eq(messages.visitorHash, hash), sql`${messages.createdAt} > datetime('now', '-1 hour')`));
    if (Number(recent?.count || 0) >= 5) return boardJson({ error: "发送得太频繁了，请一小时后再试。" }, { status: 429 });
    if (recent?.latest && Date.now() - new Date(`${recent.latest}Z`).getTime() < 30_000) return boardJson({ error: "请等 30 秒再发送下一条留言。" }, { status: 429 });
    const [message] = await db.insert(messages).values({ nickname, content, visitorHash: hash }).returning({ id: messages.id, nickname: messages.nickname, content: messages.content, createdAt: messages.createdAt });
    return boardJson({ message: { ...message, likes: 0, dislikes: 0 } }, { status: 201 });
  } catch (error) {
    return boardJson({ error: routeError(error) }, { status: 500 });
  }
}

export const OPTIONS = boardOptions;
