(() => {
  if (window.__autofillLoaded) return;
  window.__autofillLoaded = true;

  // ---- Rules: first match wins, so order matters ----------------------------
  const RULES = [
    { key: "sponsorship", re: /sponsor/i, yesno: true },
    { key: "workAuth", re: /authori[sz]ed to work|legally (authori[sz]ed|eligible|permitted)|right to work|eligible to work/i, yesno: true },
    { key: "eeo", re: /gender|race|ethnic|veteran|disabilit|pronoun|hispanic|sexual orientation/i, eeo: true },
    { key: "firstName", re: /first[\s_-]*name|given[\s_-]*name|fname/i },
    { key: "lastName", re: /last[\s_-]*name|family[\s_-]*name|surname|lname/i },
    { key: "email", re: /e-?mail/i },
    { key: "phone", re: /phone|mobile|telephone/i },
    { key: "linkedin", re: /linkedin/i },
    { key: "github", re: /github/i },
    { key: "website", re: /website|portfolio|personal (site|url)|other (url|link)/i },
    { key: "company", re: /current (company|employer)|present (company|employer)|^\s*org(anization)?\s*\*?$/i },
    { key: "title", re: /current (title|role|position)|job title/i },
    { key: "salary", re: /salary|compensation|pay expectation/i },
    { key: "noticePeriod", re: /notice period|when can you start|earliest start|available to start/i },
    { key: "location", re: /^\s*(current\s+)?(location|city)\b|where are you (located|based)|current location/i },
    { key: "fullName", re: /^\s*(full|legal|your)?\s*name\s*\*?\s*$/i, labelOnly: true }
  ];

  const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/\*/g, "").trim();
  const visible = (el) => {
    if (el.type === "hidden") return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && (r.width > 0 || r.height > 0 || el.type === "file");
  };

  function labelOf(el) {
    if (el.labels && el.labels.length) return clean(el.labels[0].innerText);
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ");
      if (clean(t)) return clean(t);
    }
    const wrap = el.closest("fieldset, .field, .form-group, [class*=question], [class*=field], li");
    const l = wrap && wrap.querySelector("label, legend, [class*=label]");
    return clean(l && l.innerText) || clean(el.placeholder);
  }

  function groupLabel(radio) {
    const fs = radio.closest("fieldset");
    const lg = fs && fs.querySelector("legend");
    if (lg) return clean(lg.innerText);
    const wrap = radio.closest("[class*=question], [class*=field], .form-group, li, div");
    const l = wrap && wrap.querySelector("label, legend, [class*=label]");
    return clean(l && l.innerText);
  }

  function setValue(el, v) {
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype
      : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); // works with React-controlled inputs
    ["input", "change", "blur"].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
  }

  const mark = (el, color) => { el.style.outline = `2px solid ${color}`; el.style.outlineOffset = "1px"; };
  const OK = "#2f7d4f", AI = "#2f5fd0", REVIEW = "#c9821a";

  // Pick the option whose text best fits a wanted answer.
  function pickOption(options, wanted, rule) {
    const texts = options.map((o) => clean(o.text).toLowerCase());
    const w = String(wanted || "").toLowerCase();
    if (rule && rule.yesno) {
      const i = texts.findIndex((t) => (w === "yes" ? /^yes\b/ : /^no\b/).test(t));
      return i;
    }
    if (rule && rule.eeo) return texts.findIndex((t) => /decline|prefer not|do not wish|don'?t wish|not to (say|disclose|answer)/.test(t));
    let i = texts.findIndex((t) => t === w);
    if (i < 0) i = texts.findIndex((t) => w && (t.includes(w) || w.includes(t)) && t.length > 1);
    return i;
  }

  function resolve(question, attrs, profile) {
    const full = `${question} ${attrs}`;
    for (const r of RULES) {
      const hay = r.labelOnly ? question : full;
      if (!r.re.test(hay)) continue;
      if (r.key === "fullName") return { rule: r, value: `${profile.firstName || ""} ${profile.lastName || ""}`.trim() };
      if (r.eeo) return profile.eeoDecline ? { rule: r, value: "decline" } : { rule: r, value: null };
      return { rule: r, value: profile[r.key] || null };
    }
    return null;
  }

  // ---- Collect fields -------------------------------------------------------
  function collect() {
    const fields = [];
    const seenRadio = new Set();
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      const t = (el.type || "").toLowerCase();
      if (["submit", "button", "reset", "image", "checkbox", "password", "search"].includes(t)) return;
      if (el.disabled || el.readOnly || !visible(el)) return;
      const attrs = `${el.name || ""} ${el.id || ""}`;
      if (t === "file") return fields.push({ el, kind: "file", question: labelOf(el), attrs });
      if (t === "radio") {
        const key = el.name || el.id;
        if (seenRadio.has(key)) return;
        seenRadio.add(key);
        const radios = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
        const options = radios.map((r) => ({ el: r, text: (r.labels && r.labels[0] && r.labels[0].innerText) || r.value }));
        return fields.push({ el, kind: "radio", question: groupLabel(el), attrs, options });
      }
      if (el.tagName === "SELECT") {
        const options = [...el.options].map((o) => ({ el: o, text: o.text, value: o.value }));
        return fields.push({ el, kind: "select", question: labelOf(el), attrs, options });
      }
      if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) {
        return fields.push({ el, kind: "combobox", question: labelOf(el), attrs });
      }
      fields.push({ el, kind: "text", question: labelOf(el), attrs });
    });
    return fields;
  }

  function isEmpty(f) {
    if (f.kind === "radio") return !f.options.some((o) => o.el.checked);
    if (f.kind === "select") return !f.el.value || f.el.selectedIndex <= 0;
    if (f.kind === "file") return !(f.el.files && f.el.files.length);
    return !f.el.value;
  }

  async function attachFile(el, file) {
    const bin = atob(file.data);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], file.name, { type: file.type || "application/pdf" }));
    el.files = dt.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const askAI = (question, options) =>
    new Promise((resolve) => {
      const jobContext = `${document.title}\n${document.body.innerText}`.slice(0, 3500);
      chrome.runtime.sendMessage({ type: "ai", question, options, jobContext }, (r) => resolve(r || { ok: false }));
    });

  // ---- Main fill ------------------------------------------------------------
  async function fill(useAI) {
    const { profile = {}, resume } = await chrome.storage.local.get(["profile", "resume"]);
    const stats = { filled: 0, ai: 0, review: [], errors: [] };
    const fields = collect();
    if (!fields.length) return stats;

    for (const f of fields) {
      try {
        if (!isEmpty(f)) continue;
        const q = f.question;

        if (f.kind === "file") {
          const hay = `${q} ${f.attrs}`;
          if (/cover/i.test(hay)) continue;
          if (/resume|cv|curriculum/i.test(hay) || !hay.trim()) {
            if (resume) { await attachFile(f.el, resume); mark(f.el, OK); stats.filled++; }
            else stats.review.push("Resume (none saved)");
          }
          continue;
        }

        const hit = resolve(q, f.attrs, profile);

        if (hit && hit.value) {
          if (f.kind === "text") { setValue(f.el, hit.value); mark(f.el, OK); stats.filled++; continue; }
          if (f.kind === "select") {
            const i = pickOption(f.options, hit.value, hit.rule);
            if (i >= 0) { setValue(f.el, f.options[i].value); mark(f.el, OK); stats.filled++; continue; }
          }
          if (f.kind === "radio") {
            const i = pickOption(f.options, hit.value, hit.rule);
            if (i >= 0) { f.options[i].el.click(); mark(f.options[i].el, OK); stats.filled++; continue; }
          }
        }

        if (f.kind === "combobox") { if (q) stats.review.push(q); continue; }

        // Nothing in the profile matched: ask Claude for questions, otherwise flag it.
        const isQuestion = q && q.length > 3 && !(hit && hit.rule.eeo);
        const wantsAI = useAI && isQuestion && (f.kind === "radio" || f.kind === "select" || f.el.tagName === "TEXTAREA" || q.length > 20);
        if (wantsAI) {
          const opts = f.options ? f.options.map((o) => clean(o.text)).filter(Boolean) : undefined;
          const r = await askAI(q, opts);
          if (r.ok && r.text && !/^SKIP\b/i.test(r.text)) {
            if (f.kind === "text") { setValue(f.el, r.text); mark(f.el, AI); stats.ai++; continue; }
            const i = pickOption(f.options, r.text, null);
            if (i >= 0 && f.kind === "select") { setValue(f.el, f.options[i].value); mark(f.el, AI); stats.ai++; continue; }
            if (i >= 0 && f.kind === "radio") { f.options[i].el.click(); mark(f.options[i].el, AI); stats.ai++; continue; }
          } else if (!r.ok && r.error) stats.errors.push(r.error);
        }
        if (q) { mark(f.el, REVIEW); stats.review.push(q); }
      } catch (e) {
        stats.errors.push(String(e.message || e));
      }
    }
    return stats;
  }

  function toast(s) {
    const d = document.createElement("div");
    d.textContent = `Autofill: ${s.filled} filled, ${s.ai} drafted by Claude, ${s.review.length} need you. Review before submitting.`;
    Object.assign(d.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647, background: "#1b2433", color: "#fff",
      font: "13px/1.4 system-ui, sans-serif", padding: "10px 14px", borderRadius: "6px", maxWidth: "320px",
      boxShadow: "0 4px 16px rgba(0,0,0,.25)"
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 8000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "fill") return;
    fill(!!msg.useAI).then((stats) => {
      if (stats.filled || stats.ai || stats.review.length) toast(stats);
      chrome.runtime.sendMessage({ type: "report", stats });
    });
  });
})();
