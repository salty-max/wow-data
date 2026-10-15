// A word for the owner: an event in Ravenpost's activity, told to their phone
// at once (the inbox's POST /api/events). The workflows' last step: a data
// update merged, a job failed, a pull request waiting for a hand.
//   bun bin/tell.ts --kind merged|failed|waiting --repo REPO [--url URL]
//                   (--title TITLE [--body BODY] | --from FILE: { title, body })
// INBOX_URL (else https://ravenpost-inbox.vercel.app) and INBOX_EVENTS_TOKEN;
// without the token, or when the inbox doesn't answer, said and let be: a
// word lost never fails the job that sends it.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = opt("from") ? (JSON.parse(readFileSync(opt("from")!, "utf8")) as { title?: string; body?: string }) : {};
const event = {
  kind: opt("kind"),
  repo: opt("repo"),
  url: opt("url"),
  title: opt("title") ?? from.title,
  body: opt("body") ?? from.body ?? "",
};
const token = process.env.INBOX_EVENTS_TOKEN;
if (!event.kind || !event.title) {
  console.error("usage: tell.ts --kind KIND --repo REPO [--url URL] (--title TITLE [--body BODY] | --from FILE)");
  process.exit(2);
}
if (!token) {
  console.log(`no INBOX_EVENTS_TOKEN: not told (${event.kind}: ${event.title})`);
  process.exit(0);
}
const url = `${(process.env.INBOX_URL || "https://ravenpost-inbox.vercel.app").replace(/\/$/, "")}/api/events`;
try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(30_000),
  });
  console.log(res.ok ? `told: ${event.title}` : `the inbox refused it (${res.status}): ${await res.text()}`);
} catch (err) {
  console.log(`the inbox didn't answer: ${err}`);
}
