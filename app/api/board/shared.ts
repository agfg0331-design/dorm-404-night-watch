import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { messages, votes } from "../../../db/schema";

export const boardDb = getDb;
export { and, desc, eq, inArray, messages, sql, votes };

const boardCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Board-Visitor",
};

export function boardJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  Object.entries(boardCorsHeaders).forEach(([name, value]) => headers.set(name, value));
  return Response.json(body, { ...init, headers });
}

export function boardOptions() {
  return new Response(null, { status: 204, headers: boardCorsHeaders });
}

export async function visitorHash(request: Request, bodyId = "") {
  const raw = request.headers.get("x-board-visitor") || bodyId || "anonymous";
  const source = `404-guestbook-v1:${raw.slice(0, 160)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s{3,}/g, "  ").trim().slice(0, max);
}

export function contentError(content: string) {
  if (!content) return "留言不能为空。";
  if (content.length > 180) return "留言最多 180 个字。";
  if (/(https?:\/\/|www\.|javascript:|<script)/i.test(content)) return "留言中不能包含链接或脚本。";
  if (/(操你妈|草你妈|傻逼|去死)/i.test(content)) return "这条留言包含不合适的内容。";
  if (/(.)\1{11,}/u.test(content)) return "请不要重复刷屏。";
  return "";
}

export function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "留言终端暂时离线。";
  if (message.includes("no such table")) return "留言数据库正在初始化，请稍后刷新。";
  return message;
}
