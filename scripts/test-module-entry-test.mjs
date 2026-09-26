import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: "", textContent: "", listeners: new Map(),
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    querySelector() { return { disabled: false }; }
  });
  return elements.get(id);
}
let posts = 0;
let opened = 0;
const storage = new Map();
const sandbox = {
  document: { getElementById: element, querySelectorAll: () => [], addEventListener() {}, body: { classList: { add() {}, remove() {} } } },
  localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  crypto: { randomUUID: () => "test-visitor" },
  location: { hostname: "dorm-404-night-watch.pages.dev" },
  window: { dispatchEvent: (event) => { if (event.type === "dorm404:test-open") opened += 1; } },
  Event: class { constructor(type) { this.type = type; } },
  fetch: () => { posts += 1; throw new Error("测试指令不应联网"); },
  setTimeout() {}, Math, Date, JSON, Intl
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("public/game/js/guestbook.js", "utf8"), sandbox);
element("guestbookContent").value = "131500";
await element("guestbookForm").listeners.get("submit")({ preventDefault() {} });
assert.equal(opened, 1, "隐藏指令没有打开测试模块");
assert.equal(posts, 0, "隐藏指令被发送至公共留言板");
assert.equal(element("guestbookContent").value, "", "隐藏指令仍留在留言输入框");
console.log("内部测试入口自检通过：131500 只在本机打开模块，未请求公共留言 API。");
