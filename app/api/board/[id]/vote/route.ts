import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { messages, votes } from "../../../../../db/schema";
import { boardJson, boardOptions } from "../../shared";

async function hashVisitor(request: Request, bodyId = "") {
  const raw = request.headers.get("x-board-visitor") || bodyId || "anonymous";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`404-guestbook-v1:${raw.slice(0, 160)}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const messageId = Number(rawId);
    const payload = await request.json() as { value?: number; visitorId?: string };
    const value = Number(payload.value);
    if (!Number.isInteger(messageId) || messageId < 1 || ![1, -1].includes(value)) return boardJson({ error: "无效的投票。" }, { status: 400 });
    const db = getDb();
    const [message] = await db.select({ id: messages.id }).from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!message) return boardJson({ error: "这条留言已经不存在。" }, { status: 404 });
    const voterHash = await hashVisitor(request, payload.visitorId);
    await db.insert(votes).values({ messageId, voterHash, value }).onConflictDoUpdate({ target: [votes.messageId, votes.voterHash], set: { value } });
    const [counts] = await db.select({ likes: sql<number>`sum(case when ${votes.value} = 1 then 1 else 0 end)`, dislikes: sql<number>`sum(case when ${votes.value} = -1 then 1 else 0 end)` }).from(votes).where(and(eq(votes.messageId, messageId)));
    return boardJson({ vote: value, likes: Number(counts?.likes || 0), dislikes: Number(counts?.dislikes || 0) });
  } catch (error) {
    return boardJson({ error: error instanceof Error ? error.message : "投票失败。" }, { status: 500 });
  }
}

export const OPTIONS = boardOptions;
