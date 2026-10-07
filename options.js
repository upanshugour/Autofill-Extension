const BASIC = [
  ["firstName", "First name"], ["lastName", "Last name"], ["email", "Email", "email"], ["phone", "Phone"],
  ["location", "City, country"], ["linkedin", "LinkedIn URL"], ["github", "GitHub URL"], ["website", "Website or portfolio"],
  ["company", "Current company"], ["title", "Current job title"]
];
const ANSWERS = [
  ["salary", "Salary expectation"], ["noticePeriod", "Notice period or start date"],
  ["workAuth", "Authorized to work in the country you're applying to?", "yesno"],
  ["sponsorship", "Will you need visa sponsorship?", "yesno"]
];
const $ = (id) => document.getElementById(id);

function build(containerId, defs) {
  defs.forEach(([key, label, type]) => {
    const d = document.createElement("div");
    const l = document.createElement("label"); l.htmlFor = key; l.textContent = label;
    let input;
    if (type === "yesno") {
      input = document.createElement("select");
      ["", "Yes", "No"].forEach((v) => input.add(new Option(v || "Choose...", v)));
      d.className = "full";
    } else {
      input = document.createElement("input"); input.type = type || "text";
    }
    input.id = key;
    d.append(l, input);
    $(containerId).appendChild(d);
  });
}
build("basics", BASIC);
build("answers", ANSWERS);

// EEO checkbox
const eeo = document.createElement("div");
eeo.className = "full";
eeo.innerHTML = '<label class="check" for="eeoDecline"><input type="checkbox" id="eeoDecline"> Choose "decline to self-identify" on gender, race, veteran and disability questions</label>';
$("answers").appendChild(eeo);

const KEYS = [...BASIC, ...ANSWERS].map((d) => d[0]);

(async () => {
  const { profile = {}, settings = {}, resume } = await chrome.storage.local.get(["profile", "settings", "resume"]);
  KEYS.forEach((k) => { if (profile[k]) $(k).value = profile[k]; });
  $("eeoDecline").checked = !!profile.eeoDecline;
  $("background").value = profile.background || "";
  $("apiKey").value = settings.apiKey || "";
  $("model").value = settings.model || "";
  if (resume) $("resumeName").textContent = `Saved: ${resume.name}`;
})();

$("resume").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const data = reader.result.split(",")[1];
    await chrome.storage.local.set({ resume: { name: file.name, type: file.type, data } });
    $("resumeName").textContent = `Saved: ${file.name}`;
  };
  reader.readAsDataURL(file);
});

$("save").addEventListener("click", async () => {
  const profile = {};
  KEYS.forEach((k) => { profile[k] = $(k).value.trim(); });
  profile.eeoDecline = $("eeoDecline").checked;
  profile.background = $("background").value.trim();
  const settings = { apiKey: $("apiKey").value.trim(), model: $("model").value.trim() };
  await chrome.storage.local.set({ profile, settings });
  $("saved").textContent = "Saved.";
  setTimeout(() => ($("saved").textContent = ""), 2500);
});
