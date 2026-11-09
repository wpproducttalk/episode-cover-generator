/** Live preview hooks for lab/wppt (optional in exported PNG renders). */
const map = {
  eyebrow: '[data-wppt-field="eyebrow"]',
  title: '[data-wppt-field="title"]',
  guest: '[data-wppt-field="guest"]',
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
    if (el) el.textContent = data.fields[key];
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
