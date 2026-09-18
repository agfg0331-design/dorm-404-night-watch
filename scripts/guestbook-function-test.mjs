import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequestGet, onRequestPost } from "../functions/api/board.js";
import { onRequestPost as onVote } from "../functions/api/board/[id]/vote.js";
import { onRequestGet as onHandoffGet, onRequestPost as onHandoffPost } from "../functions/api/handoff.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid)
      }
    };
  }
}

class D1Database {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

const env = { DB: new D1Database() };
const headers = { "Content-Type": "application/json", "X-Board-Visitor": "device-a" };

async function json(response, expectedStatus = 200) {
  assert.equal(response.status, expectedStatus);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  return response.json();
}

let data = await json(await onRequestGet({
  request: new Request("https://example.test/api/board?sort=latest", { headers }),
  env
}));
assert.deepEqual(data, { messages: [], votes: {} });

data = await json(await onRequestPost({
  request: new Request("https://example.test/api/board", {
    method: "POST",
    headers,
    body: JSON.stringify({ nickname: "夜班访客", content: "这里真的有人值班吗？", visitorId: "device-a" })
  }),
  env
}), 201);
assert.equal(data.message.id, 1);
assert.equal(data.message.likes, 0);

data = await json(await onVote({
  request: new Request("https://example.test/api/board/1/vote", {
    method: "POST",
    headers,
    body: JSON.stringify({ value: 1, visitorId: "device-a" })
  }),
  env,
  params: { id: "1" }
}));
assert.deepEqual(data, { vote: 1, likes: 1, dislikes: 0 });

data = await json(await onVote({
  request: new Request("https://example.test/api/board/1/vote", {
    method: "POST",
    headers,
    body: JSON.stringify({ value: -1, visitorId: "device-a" })
  }),
  env,
  params: { id: "1" }
}));
assert.deepEqual(data, { vote: -1, likes: 0, dislikes: 1 });

data = await json(await onRequestGet({
  request: new Request("https://example.test/api/board?sort=hot", { headers }),
  env
}));
assert.equal(data.messages.length, 1);
assert.equal(data.messages[0].dislikes, 1);
assert.equal(data.votes[1], -1);

data = await json(await onRequestPost({
  request: new Request("https://example.test/api/board", {
    method: "POST",
    headers,
    body: JSON.stringify({ nickname: "夜班访客", content: "https://spam.invalid", visitorId: "device-a" })
  }),
  env
}), 400);
assert.match(data.error, /不能包含链接/);

data = await json(await onRequestPost({
  request: new Request("https://example.test/api/board", {
    method: "POST",
    headers,
    body: JSON.stringify({ nickname: "夜班访客", content: "第二条太快了", visitorId: "device-a" })
  }),
  env
}), 429);
assert.match(data.error, /30 秒/);

const nextHeaders = { "Content-Type": "application/json", "X-Board-Visitor": "device-b" };
data = await json(await onHandoffGet({
  request: new Request("https://example.test/api/handoff", { headers: nextHeaders }),
  env
}));
assert.deepEqual(data, { message: null });

data = await json(await onHandoffPost({
  request: new Request("https://example.test/api/handoff", {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "四点以后，记得听走廊里的脚步。", endingKind: "handoff", visitorId: "device-a" })
  }),
  env
}), 201);
assert.equal(data.saved, true);
assert.equal(env.DB.database.prepare("SELECT COUNT(*) AS count FROM handoff_messages").get().count, 1);
assert.equal(env.DB.database.prepare("SELECT ending_kind AS endingKind FROM handoff_messages").get().endingKind, "handoff");

data = await json(await onHandoffGet({
  request: new Request("https://example.test/api/handoff", { headers }),
  env
}));
assert.deepEqual(data, { message: null });

data = await json(await onHandoffGet({
  request: new Request("https://example.test/api/handoff", { headers: nextHeaders }),
  env
}));
assert.equal(data.message.content, "四点以后，记得听走廊里的脚步。");

data = await json(await onHandoffPost({
  request: new Request("https://example.test/api/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Board-Visitor": "device-c" },
    body: JSON.stringify({ content: "去 https://spam.invalid 看提示", endingKind: "dawn", visitorId: "device-c" })
  }),
  env
}), 400);
assert.match(data.error, /不能包含网址/);

data = await json(await onHandoffPost({
  request: new Request("https://example.test/api/handoff", {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "第二条交班留言", endingKind: "dawn", visitorId: "device-a" })
  }),
  env
}), 429);
assert.match(data.error, /30 秒/);

console.log("D1 接口自检通过：公共留言板与独立交班留言的保存、读取、过滤和限流均正常。");
