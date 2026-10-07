// Calls the Claude API for open-ended questions. Runs in the service worker so
// the API key never touches the web page.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "ai") return;
  askClaude(msg)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
  return true; // async response
});

async function askClaude({ question, options, jobContext }) {
  const { profile = {}, settings = {} } = await chrome.storage.local.get(["profile", "settings"]);
  if (!settings.apiKey) throw new Error("No API key set");

  const system =
    "You fill in a job application on behalf of the candidate. Answer in first person, " +
    "plainly and concisely (2-5 sentences for open questions, a single value for short fields). " +
    "Use ONLY facts from the candidate profile. Never invent employers, dates, degrees, or numbers. " +
    "If the profile does not contain what is needed, reply with exactly: SKIP. " +
    "If answer options are given, reply with exactly one option's text. " +
    "Output only the answer, with no preamble or quotes.";

  const user =
    `CANDIDATE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\n` +
    `JOB PAGE (excerpt):\n${(jobContext || "").slice(0, 3500)}\n\n` +
    `QUESTION: ${question}\n` +
    (options && options.length ? `OPTIONS: ${options.join(" | ")}\n` : "");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: settings.model || "claude-sonnet-5-5",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}
