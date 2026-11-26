// WebKit(=iOS Safari 引擎) 回归：登录守卫生效 + 登录页零报错
import { webkit, devices } from "playwright";

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 15"],
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console] ${msg.text().slice(0, 200)}`);
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${String(err).slice(0, 200)}`));

const results = {};
for (const [label, url] of [["阶段1", "https://localhost:3443/bind"], ["阶段2", "https://localhost:3443/bind/A1"]]) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  results[label] = await page.evaluate(() => ({
    最终地址: location.pathname,
    登录表单: Boolean(document.querySelector("input#username")),
  }));
}

console.log(JSON.stringify({ results, errors: errors.slice(0, 5) }, null, 1));
await browser.close();
