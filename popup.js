const $ = (id) => document.getElementById(id);
const totals = { filled: 0, ai: 0, review: [], errors: [] };

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "report") return;
  const s = msg.stats;
  totals.filled += s.filled; totals.ai += s.ai;
  totals.review.push(...s.review); totals.errors.push(...s.errors);
  render();
});

function render() {
  const parts = [`${totals.filled} filled`];
  if (totals.ai) parts.push(`${totals.ai} drafted by Claude`);
  $("status").textContent = parts.join(", ") + ". Check everything, then submit yourself.";
  if (totals.errors.length) $("status").textContent += ` Claude error: ${totals.errors[0]}`;
  $("review").innerHTML = "";
  [...new Set(totals.review)].slice(0, 8).forEach((q) => {
    const li = document.createElement("li");
    li.textContent = q.slice(0, 70);
    $("review").appendChild(li);
  });
}

$("go").addEventListener("click", async () => {
  const { profile } = await chrome.storage.local.get("profile");
  if (!profile || !profile.firstName) {
    $("status").textContent = "Add your profile first.";
    return chrome.runtime.openOptionsPage();
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  Object.assign(totals, { filled: 0, ai: 0, review: [], errors: [] });
  $("status").textContent = "Filling...";
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
    chrome.tabs.sendMessage(tab.id, { type: "fill", useAI: $("ai").checked });
  } catch (e) {
    $("status").textContent = "Can't run on this page. Open a job application page first.";
  }
});

$("opts").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
