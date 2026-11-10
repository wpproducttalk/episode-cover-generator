/** Live preview hooks for lab/wppt (optional in exported PNG renders). */
const map = {
  eyebrow: '[data-wppt-field="eyebrow"]',
  title: '[data-wppt-field="title"]',
  guest: '[data-wppt-field="guest"]',
  guestPrefix: '[data-wppt-field="guestPrefix"]',
  guestName: '[data-wppt-field="guestName"]',
  lede: '[data-wppt-field="lede"]',
  meta: '[data-wppt-field="meta"]',
  date: '[data-wppt-field="date"]',
  guestLine: '[data-wppt-field="guestLine"]',
};

function renderCohosts(list) {
  const el = document.getElementById("wppt-cohosts");
  const wrap = document.getElementById("wppt-cohosts-wrap");
  const empty = !Array.isArray(list) || list.length === 0;
  if (wrap) wrap.hidden = empty;
  if (!el) return;
  if (empty) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.classList.remove("wpep-cohosts--cols-3", "wpep-cohosts--cols-2");
  if (list.length >= 4) el.classList.add("wpep-cohosts--cols-2");
  el.innerHTML = list
    .map((host) => {
      const id = host.id || "matt";
      const focus = host.focus ? ` style="object-position: ${host.focus}"` : "";
      return `
    <div class="wpep-cohost">
      <span class="wpep-cohost__ring wpep-cohost__ring--${id}">
        <img class="wpep-cohost__photo" src="${host.photo}" alt="" width="112" height="112"${focus} />
      </span>
      <span class="wpep-cohost__name" data-rf-contrast="aa">${host.name}</span>
    </div>
  `;
    })
    .join("");
}

function preventTitleWidow(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  // Support explicit line breaks via "|" if the user types one
  const segments = text.split(/\s*\|\s*/);
  return segments
    .map((seg) => {
      const words = seg.trim().split(/\s+/);
      if (words.length >= 4) {
        const last = words[words.length - 1];
        const prev = words[words.length - 2];
        // Bind the last two words with a non-breaking space unless their combined length is huge
        if (last.length + prev.length <= 16) {
          words.splice(words.length - 2, 2, `${prev}\u00A0${last}`);
        }
      }
      return words.join(" ");
    })
    .join("\n");
}

function fitTitleElement(el, rawTitle, cohostCount = 2) {
  if (!el) return;
  const formatted = preventTitleWidow(rawTitle);
  // Render explicit "\n" (from "|") as <br>
  el.innerHTML = "";
  const parts = formatted.split("\n");
  parts.forEach((part, idx) => {
    if (idx > 0) el.append(document.createElement("br"));
    el.append(document.createTextNode(part));
  });

  // Always prefer <= 3 full-width lines first (down to 44px), only allowing 4 lines
  // if the title is so long (> 78 chars) that even 44px wraps to 4 lines.
  const charLen = String(rawTitle || "").trim().length;
  const targetMaxLines = charLen <= 30 ? 2 : 3;
  const maxAllowedHeight = cohostCount >= 4 ? 195 : 225;
  const steps = [68, 64, 60, 56, 52, 48, 44, 41];
  const stepTrace = [];
  let chosenPx = null;
  let chosenLines = 1;

  for (const px of steps) {
    el.style.fontSize = `${px}px`;
    const lh = px * 1.04;
    const h = el.offsetHeight || el.getBoundingClientRect().height;
    const lines = Math.max(1, Math.round(h / lh));
    stepTrace.push({ px, lines, heightPx: Math.round(h) });
    if (lines <= targetMaxLines && h <= maxAllowedHeight) {
      chosenPx = px;
      chosenLines = lines;
      break;
    }
  }

  // Fallback for extra-long titles (> 75 chars) that need 4 lines: pick the largest step that fits in 4 lines
  if (chosenPx === null) {
    const fourLineMatch = stepTrace.find(
      (s) => s.lines <= 4 && s.heightPx <= maxAllowedHeight
    );
    chosenPx = fourLineMatch ? fourLineMatch.px : steps[steps.length - 1];
    chosenLines = fourLineMatch ? fourLineMatch.lines : 4;
    el.style.fontSize = `${chosenPx}px`;
  }

  el.dataset.fitFontPx = String(chosenPx);
  el.dataset.fitLines = String(chosenLines);
  el.dataset.fitTrace = JSON.stringify(stepTrace);
}

function fitGuestNameElement(el, rawName) {
  if (!el) return;
  el.textContent = rawName;
  // Auto-fit guest name: 37px -> 25px (44px -> 30px @ 1536), allowing 1-2 lines
  const steps = [37, 34, 31, 28, 25];
  const isMultiGuest = /\b(&|and)\b|,/i.test(String(rawName || ""));
  const targetLines = isMultiGuest && String(rawName || "").length > 26 ? 2 : 1;
  for (const px of steps) {
    el.style.fontSize = `${px}px`;
    const lh = px * 1.15;
    const h = el.offsetHeight || el.getBoundingClientRect().height;
    const lines = Math.max(1, Math.round(h / lh));
    if (lines <= targetLines) break;
  }
}
const OVERLAY_PATTERN_IDS = [
  "bokeh",
  "code",
  "stars",
  "milky-way",
  "nebula",
  "none",
];

function applyBackgroundGradient(css) {
  if (!css) return;
  const canvas = document.querySelector("[data-asset-canvas]");
  if (canvas) {
    canvas.style.setProperty("--wppt-gradient", css);
  }
  document.documentElement.style.background = css;
}

function applyOverlayPattern(patternId) {
  const el = document.getElementById("wppt-pattern");
  if (!el) return;
  const pick = OVERLAY_PATTERN_IDS.includes(patternId) ? patternId : "bokeh";
  for (const id of OVERLAY_PATTERN_IDS) {
    el.classList.remove(`wpep-pattern--${id}`);
  }
  el.classList.add(`wpep-pattern--${pick}`);
}

function setGuestCutoutProcessing(on) {
  const guest = document.querySelector(".wpep-guest");
  if (guest) guest.classList.toggle("wpep-guest--cutout", Boolean(on));
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data) return;

  if (data.type === "wppt-lab-cutout") {
    setGuestCutoutProcessing(data.processing);
    return;
  }

  if (data.type !== "wppt-lab-update") return;

  for (const [key, sel] of Object.entries(map)) {
    if (data.fields?.[key] == null) continue;
    const el = document.querySelector(sel);
    if (!el) continue;
    if (key === "title") {
      const cohostCount = Array.isArray(data.cohosts) ? data.cohosts.length : 2;
      fitTitleElement(el, data.fields.title, cohostCount);
    } else if (key === "guestName") {
      fitGuestNameElement(el, data.fields.guestName);
    } else {
      el.textContent = data.fields[key];
    }
  }

  if (data.guestSrc) {
    const img = document.getElementById("wppt-guest");
    if (img) img.src = data.guestSrc;
  }

  if (data.guestOffset) {
    const canvas = document.querySelector("[data-asset-canvas]");
    if (canvas) {
      const x = Number(data.guestOffset.x) || 0;
      const y = Number(data.guestOffset.y) || 0;
      const scale = Number(data.guestOffset.scale);
      canvas.style.setProperty("--wppt-guest-x", `${x}px`);
      canvas.style.setProperty("--wppt-guest-y", `${y}px`);
      canvas.style.setProperty(
        "--wppt-guest-scale",
        Number.isFinite(scale) && scale > 0 ? String(scale) : "1"
      );
    }
  }

  if (data.backgroundGradient) {
    applyBackgroundGradient(data.backgroundGradient);
  }

  if (data.overlayPattern) {
    applyOverlayPattern(data.overlayPattern);
  }

  if ("cohosts" in data) {
    renderCohosts(data.cohosts);
  }
});
