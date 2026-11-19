import { test } from "node:test";
import assert from "node:assert/strict";

import {
  redact, restore, checkReply, detectEscalations, REDACTION_LABEL,
} from "../lib/crossborder/service-reply.ts";

/* ---------------- 脱敏：必须发生在调模型之前 ---------------- */

test("redact · 认出邮箱 / 订单号 / 链接 / 电话", () => {
  const src = "订单 123-4567890-1234567 有问题，请发到 ken@example.com 或打 555-123-4567，详见 https://evil.com/x";
  const { text, redactions } = redact(src);
  assert.ok(!text.includes("ken@example.com"), "邮箱应被替换");
  assert.ok(!text.includes("123-4567890-1234567"), "订单号应被替换");
  assert.ok(!text.includes("https://evil.com/x"), "链接应被替换");
  assert.ok(!text.includes("555-123-4567"), "电话应被替换");
  assert.deepEqual(
    [...new Set(redactions.map((r) => r.kind))].sort(),
    ["email", "order_id", "phone", "url"],
  );
});

// 同一个值必须映射到同一个占位符，否则模型引用它时会自相矛盾。
test("redact · 同一个值复用同一个占位符", () => {
  const { text, redactions } = redact("发到 a@b.com，再抄送 a@b.com");
  assert.equal(redactions.filter((r) => r.kind === "email").length, 1);
  assert.equal(text.match(/\[邮箱1\]/g)?.length, 2);
});

test("redact · 订单号不被电话规则先吃掉", () => {
  const { redactions } = redact("订单 123-4567890-1234567");
  assert.equal(redactions[0].kind, "order_id");
  assert.equal(redactions[0].original, "123-4567890-1234567");
});

test("redact · 没有个人信息时原样返回", () => {
  const { text, redactions } = redact("The lid leaks when I tilt the bottle.");
  assert.equal(text, "The lid leaks when I tilt the bottle.");
  assert.deepEqual(redactions, []);
});

test("restore · 把占位符还原成原值，供用户复制发送", () => {
  const { redactions } = redact("订单 123-4567890-1234567 请退款");
  const reply = `Regarding order ${redactions[0].placeholder}, we will refund you.`;
  assert.match(restore(reply, redactions), /order 123-4567890-1234567/);
});

// 脱敏与还原都在浏览器里做，服务端拿不到原值 —— 这条钉住往返能自洽。
test("redact → restore · 往返回到原文", () => {
  const src = "订单 123-4567890-1234567，邮箱 a@b.com，电话 555-123-4567";
  const { text, redactions } = redact(src);
  assert.notEqual(text, src);
  assert.equal(restore(text, redactions), src);
});

test("REDACTION_LABEL · 每种类型都有中文标签", () => {
  for (const k of ["email", "phone", "order_id", "tracking", "url"] as const) {
    assert.ok(REDACTION_LABEL[k], `${k} 缺标签`);
  }
});

/* ---------------- 消息合规：模型不能给自己判卷 ---------------- */

test("checkReply · 外部链接判违规", () => {
  const i = checkReply("Please see https://our-site.com/guide for details.");
  assert.equal(i[0].id, "external-link");
  assert.equal(i[0].level, "violation");
});

test("checkReply · 站外联系方式判违规", () => {
  assert.ok(checkReply("Email us at help@brand.com").some((x) => x.id === "contact-info"));
  assert.ok(checkReply("加我微信详聊").some((x) => x.id === "contact-info"));
});

// 索评是最容易被顺手写进去的一条 ——「如果满意请留个评价」也算。
test("checkReply · 索评判违规，含中英文与暗示写法", () => {
  for (const t of [
    "If you are happy, please leave a positive review",
    "We would appreciate a 5-star rating",
    "满意的话麻烦给个好评",
  ]) {
    assert.ok(checkReply(t).some((x) => x.id === "review-solicit"), `漏掉：${t}`);
  }
});

test("checkReply · 营销与站外退款判违规", () => {
  assert.ok(checkReply("Use coupon SAVE10 next time").some((x) => x.id === "marketing"));
  assert.ok(checkReply("We can refund you via PayPal directly").some((x) => x.id === "off-platform-refund"));
});

test("checkReply · 医疗功效与绝对化承诺判警告", () => {
  const med = checkReply("This will cure your skin issue");
  assert.equal(med.find((x) => x.id === "medical-claim")?.level, "warn");
  const abs = checkReply("It is 100% guaranteed to never fail");
  assert.ok(abs.some((x) => x.id === "absolute-claim"));
});

test("checkReply · 干净的回复不报噪音", () => {
  assert.deepEqual(
    checkReply("Sorry about the lid. We have shipped a replacement, it should arrive next week."),
    [],
  );
});

test("checkReply · 违规排在警告前面", () => {
  const i = checkReply("Visit https://x.com and this will cure everything");
  assert.equal(i[0].level, "violation");
  assert.equal(i[i.length - 1].level, "warn");
});

/* ---------------- 人工升级：有些事不该用模板回 ---------------- */

// 给「我要起诉你」生成一段得体回复，是最糟的处理方式。
test("detectEscalations · 法律 / 伤害 / 监管 / 拒付都要转人工", () => {
  assert.equal(detectEscalations("I will contact my lawyer")[0].id, "legal");
  assert.equal(detectEscalations("The bottle burned my hand, I went to the hospital")[0].id, "injury");
  assert.equal(detectEscalations("我要投诉到监管部门")[0].id, "regulator");
  assert.equal(detectEscalations("I am filing a chargeback")[0].id, "chargeback");
});

test("detectEscalations · 普通问题不误报", () => {
  assert.deepEqual(detectEscalations("The lid leaks a bit, can I get a replacement?"), []);
});

test("detectEscalations · 说明为什么不该用模板回", () => {
  assert.match(detectEscalations("I will sue you")[0].text, /不该用模板回复/);
  assert.match(detectEscalations("my child was injured")[0].text, /安全事件/);
});
