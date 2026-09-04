import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  // Emulate a dark OS, like the user's machine.
  const ctx = await b.newContext({ colorScheme: "dark" });
  const p = await ctx.newPage();

  await p.goto("http://localhost:63140/tools/health-check", { waitUntil: "networkidle" });
  console.log("standalone  dark class:", await p.evaluate(() => document.documentElement.classList.contains("dark")));
  console.log("standalone  body bg   :", await p.evaluate(() => getComputedStyle(document.body).backgroundColor));

  await p.goto("http://localhost:63140/tools/health-check?embed=1", { waitUntil: "networkidle" });
  console.log("embed=1     dark class:", await p.evaluate(() => document.documentElement.classList.contains("dark")));
  console.log("embed=1     body bg   :", await p.evaluate(() => getComputedStyle(document.body).backgroundColor));

  // And inside a real iframe, which is how the drawer loads it.
  await p.setContent(`<body style="margin:0"><iframe src="http://localhost:63140/tools/health-check?embed=1" style="width:900px;height:600px;border:0"></iframe></body>`);
  await p.waitForTimeout(2500);
  const f = p.frames()[1];
  if (f) {
    console.log("in iframe   dark class:", await f.evaluate(() => document.documentElement.classList.contains("dark")));
    console.log("in iframe   body bg   :", await f.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  await b.close();
}
void main().then(() => process.exit(0));
