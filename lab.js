const CANVAS_W = 1280;
const CANVAS_H = 720;
const EXPORT_SCALE = 2;
const IS_LOCAL_LAB_SERVER = window.location.pathname.startsWith("/lab/wppt");
const COHOST_ASSET_ROOT = "./cover/";
const PREVIEW_PATH = "./cover/index.html";
const HOSTS_JSON_URL = "./hosts.json";

import { removeBackground } from "https://esm.sh/@imgly/background-removal@1.4.5";

/** Signature + stripe anchors: card #5e53c0 · #fed000 · #a81de9; brand #c751c0 · #4158d0 */
const BACKGROUND_GRADIENTS = [
  {
    id: "signature",
    label: "Signature",
    css: `linear-gradient(118deg, #1a1640 0%, #38307f 22%, #5e53c0 48%, #7c3fb8 72%, #a81de9 88%, #c45ce0 100%)`,
  },
  {
    id: "purple",
    label: "Royal purple",
    css: `linear-gradient(120deg, #12102c 0%, #2a2460 34%, #5e53c0 66%, #7068cc 86%, #847cd8 100%)`,
  },
  {
    id: "gold",
    label: "Show gold",
    css: `linear-gradient(122deg, #18142e 0%, #3a3250 28%, #6a5838 52%, #fed000 76%, #ffe566 100%)`,
  },
  {
    id: "orchid",
    label: "Orchid",
    css: `linear-gradient(118deg, #140c24 0%, #381858 32%, #782098 58%, #a81de9 80%, #c060f0 100%)`,
  },
  {
    id: "magenta",
    label: "Magenta",
    css: `linear-gradient(120deg, #14081c 0%, #401040 30%, #882868 58%, #c751c0 82%, #dc78cc 100%)`,
  },
  {
    id: "blue",
    label: "Sapphire",
    css: `linear-gradient(118deg, #0c1020 0%, #1c2860 32%, #304890 58%, #4158d0 80%, #5870e8 100%)`,
  },
];

const PATTERN_PREVIEW_ROOT = "./cover/assets/patterns";

const OVERLAY_PATTERNS = [
  { id: "bokeh", label: "Bokeh", preview: `${PATTERN_PREVIEW_ROOT}/bokeh-overlay.png` },
  { id: "code", label: "Code", preview: `${PATTERN_PREVIEW_ROOT}/code-kit.png` },
  { id: "stars", label: "Stars", preview: `${PATTERN_PREVIEW_ROOT}/stars-kit.png` },
  { id: "milky-way", label: "Milky Way", preview: `${PATTERN_PREVIEW_ROOT}/milky-way.png` },
  { id: "nebula", label: "Nebula", preview: `${PATTERN_PREVIEW_ROOT}/mily-way-2.png` },
  { id: "none", label: "None", preview: null },
];

const FRAMES = [
  {
    title: "Episode Cover Preview",
    path: PREVIEW_PATH,
  },
];

const fields = {
  episode: document.getElementById("episode"),
  title: document.getElementById("title"),
  guest: document.getElementById("guestName"),
  date: document.getElementById("date"),
};

const statusEl = document.getElementById("status");
const framesRoot = document.getElementById("frames");
const btnCutoutLocal = document.getElementById("btnCutoutLocal");
const btnApply = document.getElementById("btnApplyPhoto");
const btnGeneratePng = document.getElementById("btnGeneratePng");
const fileInput = document.getElementById("guestPhoto");
const debugDrawer = document.getElementById("debugDrawer");
const debugLogEl = document.getElementById("debugLog");
const debugStagesImg = document.getElementById("debugCutoutStages");
const btnCopyDebug = document.getElementById("btnCopyDebug");

const IS_DEBUG_ENABLED =
  IS_LOCAL_LAB_SERVER ||
  new URLSearchParams(window.location.search).get("debug") === "1";

const debugState = {
  updatedAt: null,
  cutout: null,
  layout: null,
  export: null,
};

function updateDebugUI(extraFiles = {}) {
  debugState.updatedAt = new Date().toISOString();
  if (IS_DEBUG_ENABLED && debugDrawer) {
    debugDrawer.hidden = false;
    if (debugLogEl) {
      debugLogEl.textContent = JSON.stringify(debugState, null, 2);
    }
    if (debugStagesImg && extraFiles.cutoutStagesDataUrl) {
      debugStagesImg.src = extraFiles.cutoutStagesDataUrl;
      debugStagesImg.hidden = false;
    }
  }
  if (IS_LOCAL_LAB_SERVER) {
    fetch("/api/debug/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report: debugState,
        ...extraFiles,
      }),
    }).catch(() => {});
  }
}

btnCopyDebug?.addEventListener("click", () => {
  navigator.clipboard?.writeText(JSON.stringify(debugState, null, 2));
  setStatus("Copied diagnostic JSON report to clipboard.");
});

let guestSrc = null;
let guestFile = null;
let guestObjectUrl = null;
const guestOffset = { x: 0, y: 0, scale: 1 };
const iframes = [];
const viewports = [];

const guestX = document.getElementById("guestX");
const guestY = document.getElementById("guestY");
const guestXVal = document.getElementById("guestXVal");
const guestYVal = document.getElementById("guestYVal");
const guestScale = document.getElementById("guestScale");
const guestScaleVal = document.getElementById("guestScaleVal");
const cohostPicker = document.getElementById("cohostPicker");
const gradientPicker = document.getElementById("gradientPicker");
const patternPicker = document.getElementById("patternPicker");

let hostsCatalog = [];
let selectedGradientId = BACKGROUND_GRADIENTS[0].id;
let selectedPatternId = OVERLAY_PATTERNS[0].id;
let guestPhotoApplied = false;

const guestActions = document.getElementById("guestActions");

function gradientCss() {
  return (
    BACKGROUND_GRADIENTS.find((g) => g.id === selectedGradientId)?.css ??
    BACKGROUND_GRADIENTS[0].css
  );
}

function setStatus(msg, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("is-error", err);
}

function formatTiming(timing) {
  if (!timing?.steps?.length) return "";
  const parts = timing.steps.map((s) => `${s.step} ${s.ms}ms`);
  return `${timing.totalMs}ms total — ${parts.join(" · ")}`;
}

function revokeGuestUrl() {
  if (guestObjectUrl) {
    URL.revokeObjectURL(guestObjectUrl);
    guestObjectUrl = null;
  }
}

function fieldPayload() {
  const ep = fields.episode.value.trim();
  const title = fields.title.value.trim() || "Episode title";
  const guest = fields.guest.value.trim() || "Featured guest";
  const date = fields.date.value.trim() || "Nov 18, 2026";
  const isPluralGuest = /\b(&|and)\b|,/i.test(guest);
  const guestPrefix = isPluralGuest
    ? "with special guests:"
    : "with special guest:";
  return {
    eyebrow: ep ? `Episode ${ep}` : "WP Product Talk",
    title,
    guest: `${guestPrefix} ${guest}`,
    guestPrefix,
    guestName: guest,
    meta: guest,
    guestLine: `Guest: ${guest}`,
    date,
    live: "LIVE!",
  };
}

function exportFilename() {
  const ep = fields.episode.value.trim();
  return ep ? `wppt-episode-${ep}-2560x1440.png` : "wppt-episode-cover-2560x1440.png";
}

function syncNudgeOutputs() {
  if (guestXVal) guestXVal.textContent = String(guestOffset.x);
  if (guestYVal) guestYVal.textContent = String(guestOffset.y);
  if (guestScaleVal) guestScaleVal.textContent = `${Math.round(guestOffset.scale * 100)}%`;
}

function selectedCohosts() {
  if (!cohostPicker) return [];
  return hostsCatalog
    .filter((host) =>
      cohostPicker.querySelector(`[data-cohost-id="${host.id}"]`)?.classList.contains("is-selected")
    )
    .map((host) => ({
      id: host.id,
      name: host.name,
      photo: new URL(`${COHOST_ASSET_ROOT}${host.photo}`, window.location.href).href,
      focus: host.focus,
    }));
}

function broadcastPayload() {
  return {
    type: "wppt-lab-update",
    fields: fieldPayload(),
    guestSrc,
    guestOffset,
    cohosts: selectedCohosts(),
    backgroundGradient: gradientCss(),
    overlayPattern: selectedPatternId,
  };
}

function captureLiveLayoutTelemetry() {
  if (!IS_DEBUG_ENABLED) return;
  const iframeDoc = iframes[0]?.contentDocument;
  const rootEl = iframeDoc?.querySelector("[data-asset-canvas]");
  const titleEl = iframeDoc?.querySelector(".wpep-title");
  if (!iframeDoc || !rootEl || !titleEl) return;

  const rootRect = rootEl.getBoundingClientRect();
  const scaleX = rootRect.width > 0 ? rootRect.width / CANVAS_W : 1;
  const scaleY = rootRect.height > 0 ? rootRect.height / CANVAS_H : 1;
  const toLogicalRect = (domRect) => {
    const left = (domRect.left - rootRect.left) / scaleX;
    const top = (domRect.top - rootRect.top) / scaleY;
    const width = domRect.width / scaleX;
    const height = domRect.height / scaleY;
    return { left, top, width, height, right: left + width, bottom: top + height };
  };

  const cs = iframeDoc.defaultView.getComputedStyle(titleEl);
  const fontPx = parseFloat(cs.fontSize) || 68;
  let stepTrace = [];
  try {
    stepTrace = JSON.parse(titleEl.dataset.fitTrace || "[]");
  } catch {
    stepTrace = [];
  }
  const domLines = extractRenderedLines(titleEl, toLogicalRect).map((ln) => ({
    text: ln.text,
    left: Math.round(ln.left * 10) / 10,
    top: Math.round(ln.top * 10) / 10,
  }));
  const cardEl = iframeDoc.querySelector(".wpep-card");
  const cardR = cardEl ? toLogicalRect(cardEl.getBoundingClientRect()) : null;

  debugState.layout = {
    rawTitle: fieldPayload().title,
    titleCharCount: fieldPayload().title.length,
    chosenFontPx: fontPx,
    lineCount: domLines.length,
    stepTrace,
    renderedLines: domLines,
    cardRect: cardR
      ? {
          left: Math.round(cardR.left),
          top: Math.round(cardR.top),
          width: Math.round(cardR.width),
          height: Math.round(cardR.height),
        }
      : null,
  };
  if (debugDrawer && !debugDrawer.hidden && debugLogEl) {
    debugLogEl.textContent = JSON.stringify(debugState, null, 2);
  }
}

function broadcast() {
  const message = broadcastPayload();
  for (const frame of iframes) {
    frame.contentWindow?.postMessage(message, window.location.origin);
  }
  setTimeout(captureLiveLayoutTelemetry, 50);
}

function broadcastCutoutProcessing(processing) {
  for (const frame of iframes) {
    frame.contentWindow?.postMessage(
      { type: "wppt-lab-cutout", processing },
      window.location.origin
    );
  }
}

function updateGuestActionUI() {
  const showCutout = guestPhotoApplied;
  if (btnCutoutLocal) btnCutoutLocal.hidden = !showCutout;
  guestActions?.classList.toggle("wppt-lab__guest-actions--solo", !showCutout);
}

function fitViewports() {
  for (let i = 0; i < viewports.length; i++) {
    const viewport = viewports[i];
    const iframe = iframes[i];
    if (!viewport || !iframe) continue;
    const w = viewport.clientWidth;
    if (w <= 0) continue;
    const scale = w / CANVAS_W;
    iframe.style.transform = `scale(${scale})`;
    viewport.style.height = `${CANVAS_H * scale}px`;
  }
}

function mountFrames() {
  for (const spec of FRAMES) {
    const block = document.createElement("section");
    block.className = "wppt-lab__variant";
    block.innerHTML = `<h2 class="wppt-lab__preview-title">${spec.title}</h2>`;

    const viewport = document.createElement("div");
    viewport.className = "wppt-lab__viewport";

    const iframe = document.createElement("iframe");
    iframe.title = spec.title;
    iframe.loading = "lazy";
    iframe.src = spec.path;
    iframe.addEventListener("load", () => {
      broadcast();
      fitViewports();
    });

    viewport.append(iframe);
    block.append(viewport);
    framesRoot.append(block);

    viewports.push(viewport);
    iframes.push(iframe);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => fitViewports());
      ro.observe(viewport);
    }
  }

  window.addEventListener("resize", fitViewports);
  requestAnimationFrame(fitViewports);
}

function ensureFile() {
  const file = fileInput.files?.[0] ?? guestFile;
  if (!file) {
    setStatus("Choose a guest photo first.", true);
    return null;
  }
  guestFile = file;
  return file;
}

function applyPhoto(file) {
  revokeGuestUrl();
  guestObjectUrl = URL.createObjectURL(file);
  guestSrc = guestObjectUrl;
  guestPhotoApplied = true;
  updateGuestActionUI();
  broadcast();
  setStatus(`Showing ${file.name}. You can remove the background or adjust position.`);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function blobUrlToDataUrl(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return fileToDataUrl(blob);
}

async function loadImageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Detect uniform studio backdrops (black, dark grey, mid grey, navy, etc.)
 * via border sampling + connected flood-fill, then build a high-contrast
 * detection image for ISNet (turning the connected backdrop pure white when
 * the subject's lower torso/jacket is dark, or lifting dark shadows on black)
 * without altering the original photo's pixel colors in the final composite.
 */
async function buildShadowBoostedInput(file) {
  const img = await loadImageFromBlob(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const origImageData = ctx.getImageData(0, 0, w, h);
  const data = origImageData.data;

  // Sample outer top/side border pixels (above shoulder height y < 0.62*h)
  const samplesR = [];
  const samplesG = [];
  const samplesB = [];
  const samplesLum = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
  const margin = Math.max(4, Math.floor(Math.min(w, h) * 0.03));

  for (let y = 0; y < Math.floor(h * 0.62); y += step) {
    for (const x of [margin, w - 1 - margin]) {
      const i = (y * w + x) * 4;
      samplesR.push(data[i]);
      samplesG.push(data[i + 1]);
      samplesB.push(data[i + 2]);
      samplesLum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
  }
  for (let x = margin; x < w - margin; x += step) {
    const i = (margin * w + x) * 4;
    samplesR.push(data[i]);
    samplesG.push(data[i + 1]);
    samplesB.push(data[i + 2]);
    samplesLum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] || 0;
  };
  const bgR = median(samplesR);
  const bgG = median(samplesG);
  const bgB = median(samplesB);
  const avgBorderLum = median(samplesLum);

  // Measure median absolute deviation of border color to see if it's a uniform studio backdrop
  const diffs = samplesR.map(
    (r, idx) =>
      Math.abs(r - bgR) +
      Math.abs(samplesG[idx] - bgG) +
      Math.abs(samplesB[idx] - bgB)
  );
  const madColor = median(diffs);
  const isPureBlackBackdrop = avgBorderLum < 12 && madColor < 18;
  const isUniformStudioBackdrop = madColor < 32 && avgBorderLum < 165;

  if (!isPureBlackBackdrop && !isUniformStudioBackdrop) {
    return {
      detectBlob: file,
      origImageData,
      w,
      h,
      isDarkBackdrop: false,
      isPureBlackBackdrop: false,
      bgMask: null,
      telemetry: {
        dimensions: `${w}x${h}`,
        mode: "standard-isnet",
        borderMedianRgb: [bgR, bgG, bgB],
        borderMadColor: Math.round(madColor * 10) / 10,
        avgBorderLum: Math.round(avgBorderLum * 10) / 10,
      },
    };
  }

  // Connected exterior flood-fill from top, left, and right edges for studio backdrops
  // Uses both global distance to local border reference and step-to-step gradient guard
  const bgMask = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qHead = 0;
  let qTail = 0;
  const globalTol = isPureBlackBackdrop ? 6 : Math.max(26, madColor * 2.4);
  const stepTol = isPureBlackBackdrop ? 3 : 10;

  const trySeed = (x, y) => {
    const idx = y * w + x;
    if (bgMask[idx]) return;
    const i = idx * 4;
    const dGlobal =
      Math.abs(data[i] - bgR) +
      Math.abs(data[i + 1] - bgG) +
      Math.abs(data[i + 2] - bgB);
    if (dGlobal <= globalTol * 1.35) {
      bgMask[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) trySeed(x, 0);
  for (let y = 0; y < Math.floor(h * 0.82); y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % w;
    const cy = (curr - cx) / w;
    const ci = curr * 4;
    const cr = data[ci];
    const cg = data[ci + 1];
    const cb = data[ci + 2];

    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (bgMask[nIdx]) continue;
      const ni = nIdx * 4;
      const nr = data[ni];
      const ng = data[ni + 1];
      const nb = data[ni + 2];
      const dStep = Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb);
      if (dStep > stepTol) continue;
      const dGlobal =
        Math.abs(nr - bgR) + Math.abs(ng - bgG) + Math.abs(nb - bgB);
      if (dGlobal <= globalTol) {
        bgMask[nIdx] = 1;
        queue[qTail++] = nIdx;
      }
    }
  }

  // Sample lower-center torso luminance (jacket/shirt area)
  const torsoLums = [];
  for (let y = Math.floor(h * 0.72); y < Math.floor(h * 0.96); y += step) {
    for (let x = Math.floor(w * 0.28); x < Math.floor(w * 0.72); x += step) {
      const i = (y * w + x) * 4;
      torsoLums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
  }
  const medianTorsoLum = median(torsoLums);

  const boosted = ctx.createImageData(w, h);
  const bData = boosted.data;

  // IMPORTANT:
  // - On pure-black backdrops (like Brian's where the black jacket is rgb(8,8,8) against rgb(0,0,0)),
  //   we lift shadows below y = 0.62h so ISNet sees the jacket contour.
  // - On mid-grey/colored studio backdrops (like Jason's where his face extends down to y = 0.84h),
  //   we only ramp in the white background swap in the bottom 16% of the frame (y = 0.84h .. 0.90h)
  //   where the suit shoulders meet the bottom edge, keeping 100% of the head, cheeks, jaw, and ears
  //   untouched for ISNet's native alpha matting!
  const rampStartY = Math.floor(h * (isPureBlackBackdrop ? 0.62 : 0.84));
  const rampEndY = Math.floor(h * (isPureBlackBackdrop ? 0.72 : 0.9));
  const rampSpan = Math.max(1, rampEndY - rampStartY);

  if (isPureBlackBackdrop) {
    const lut = new Uint8ClampedArray(256);
    const floor = 2;
    for (let v = 0; v < 256; v++) {
      if (v <= floor) {
        lut[v] = 0;
      } else {
        const norm = (v - floor) / (255 - floor);
        lut[v] = Math.min(255, Math.round(Math.pow(norm, 0.36) * 255));
      }
    }
    for (let y = 0; y < h; y++) {
      const weight =
        y <= rampStartY ? 0 : y >= rampEndY ? 1 : (y - rampStartY) / rampSpan;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        if (weight === 0) {
          bData[i] = data[i];
          bData[i + 1] = data[i + 1];
          bData[i + 2] = data[i + 2];
          bData[i + 3] = data[i + 3];
        } else if (bgMask[idx]) {
          bData[i] = Math.round(data[i] * (1 - weight));
          bData[i + 1] = Math.round(data[i + 1] * (1 - weight));
          bData[i + 2] = Math.round(data[i + 2] * (1 - weight));
          bData[i + 3] = 255;
        } else {
          bData[i] = Math.round(data[i] * (1 - weight) + lut[data[i]] * weight);
          bData[i + 1] = Math.round(data[i + 1] * (1 - weight) + lut[data[i + 1]] * weight);
          bData[i + 2] = Math.round(data[i + 2] * (1 - weight) + lut[data[i + 2]] * weight);
          bData[i + 3] = data[i + 3];
        }
      }
    }
  } else {
    const fillVal = medianTorsoLum < 120 ? 255 : 0;
    for (let y = 0; y < h; y++) {
      const weight =
        y <= rampStartY ? 0 : y >= rampEndY ? 1 : (y - rampStartY) / rampSpan;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        if (weight > 0 && bgMask[idx]) {
          bData[i] = Math.round(data[i] * (1 - weight) + fillVal * weight);
          bData[i + 1] = Math.round(data[i + 1] * (1 - weight) + fillVal * weight);
          bData[i + 2] = Math.round(data[i + 2] * (1 - weight) + fillVal * weight);
          bData[i + 3] = 255;
        } else {
          bData[i] = data[i];
          bData[i + 1] = data[i + 1];
          bData[i + 2] = data[i + 2];
          bData[i + 3] = data[i + 3];
        }
      }
    }
  }

  let bgCount = 0;
  for (let i = 0; i < bgMask.length; i++) if (bgMask[i]) bgCount++;

  ctx.putImageData(boosted, 0, 0);
  const detectBlob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  return {
    detectBlob,
    origImageData,
    w,
    h,
    isDarkBackdrop: true,
    isPureBlackBackdrop,
    bgRgb: [bgR, bgG, bgB],
    bgMask,
    telemetry: {
      dimensions: `${w}x${h}`,
      mode: isPureBlackBackdrop
        ? "pure-black-backdrop"
        : "uniform-studio-backdrop",
      borderMedianRgb: [bgR, bgG, bgB],
      borderMadColor: Math.round(madColor * 10) / 10,
      avgBorderLum: Math.round(avgBorderLum * 10) / 10,
      medianTorsoLum: Math.round(medianTorsoLum * 10) / 10,
      floodFilledBgPct: Math.round((bgCount / (w * h)) * 1000) / 10,
      shoulderRampY: [rampStartY, rampEndY],
    },
  };
}

/**
 * Composite the segmentation mask onto the ORIGINAL pixels, with:
 * 1. Dynamic neck/shoulder waist detection so close-up headshots (like Jason's)
 *    never apply shoulder-span rules across the cheek or jaw.
 * 2. Edge color decontamination (de-spill) + grey-fringe alpha tightening along
 *    semi-transparent face/hair/glasses edges (`0 < alpha < 248`) so studio wall
 *    color (`[62, 62, 66]`) never shows as a rough halo over the purple cover.
 */
async function compositeCleanCutout(
  maskBlob,
  origImageData,
  w,
  h,
  isDarkBackdrop,
  isPureBlackBackdrop,
  bgRgb,
  bgMask,
  detectBlob
) {
  const maskImg = await loadImageFromBlob(maskBlob);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(maskImg, 0, 0, w, h);

  const maskData = ctx.getImageData(0, 0, w, h).data;
  const orig = origImageData.data;
  const out = ctx.createImageData(w, h);
  const dst = out.data;

  // Dynamically find where the shoulders flare out below the head/chin:
  // On pure-black backdrops (Brian), start around 0.64h; on grey studio close-ups (Jason),
  // start at 0.85h (bottom 15% of frame) so the face/jawline is 100% governed by ISNet + de-spill.
  const shoulderStartY = Math.floor(h * (isPureBlackBackdrop ? 0.64 : 0.85));
  const shoulderFullY = Math.floor(h * (isPureBlackBackdrop ? 0.72 : 0.91));
  const shoulderRamp = Math.max(1, shoulderFullY - shoulderStartY);
  const erodePx = isPureBlackBackdrop ? 0 : 4;

  const rowLeft = new Int32Array(h).fill(w);
  const rowRight = new Int32Array(h).fill(-1);
  if (isDarkBackdrop) {
    for (let y = shoulderStartY; y < h; y++) {
      let l = w;
      let r = -1;
      for (let x = 0; x < w; x++) {
        const pIdx = y * w + x;
        const idx = pIdx * 4;
        const mA = maskData[idx + 3];
        const isNotBg = bgMask ? !bgMask[pIdx] : mA >= 80;
        if (isNotBg || mA >= 80) {
          if (x < l) l = x;
          if (x > r) r = x;
        }
      }
      if (r - l > erodePx * 2) {
        rowLeft[y] = l + erodePx;
        rowRight[y] = r - erodePx;
      }
    }
    const smoothL = new Int32Array(h).fill(w);
    const smoothR = new Int32Array(h).fill(-1);
    for (let y = shoulderStartY; y < h; y++) {
      let sumL = 0,
        sumR = 0,
        cnt = 0;
      for (let dy = -5; dy <= 5; dy++) {
        const ny = y + dy;
        if (ny >= shoulderStartY && ny < h && rowRight[ny] >= rowLeft[ny]) {
          sumL += rowLeft[ny];
          sumR += rowRight[ny];
          cnt++;
        }
      }
      smoothL[y] = cnt ? Math.round(sumL / cnt) : rowLeft[y];
      smoothR[y] = cnt ? Math.round(sumR / cnt) : rowRight[y];
    }
    rowLeft.set(smoothL);
    rowRight.set(smoothR);
  }

  const [bgR, bgG, bgB] = bgRgb || [0, 0, 0];
  const lowCut = 18;
  const highCut = 140;
  const span = highCut - lowCut;
  const feather = 6;

  for (let y = 0; y < h; y++) {
    const lEdge = rowLeft[y];
    const rEdge = rowRight[y];
    const inShoulderZone = isDarkBackdrop && y >= shoulderStartY && rEdge >= lEdge;
    const zoneWeight = !inShoulderZone
      ? 0
      : y >= shoulderFullY
        ? 1
        : (y - shoulderStartY) / shoulderRamp;

    for (let x = 0; x < w; x++) {
      const pIdx = y * w + x;
      const i = pIdx * 4;
      let r = orig[i];
      let g = orig[i + 1];
      let b = orig[i + 2];
      const a = maskData[i + 3];

      let finalAlpha = a;

      if (!inShoulderZone) {
        // Head, face, glasses, hair:
        // If connected flood-fill proved this pixel is backdrop AND ISNet alpha is weak/medium (< 185),
        // strip it so grey studio backdrop never clings to the side of the cheek/ear!
        if (bgMask && bgMask[pIdx] && a < 185) {
          finalAlpha = 0;
        } else if (a <= 14) {
          finalAlpha = 0;
        } else if (isDarkBackdrop && !isPureBlackBackdrop && a < 245) {
          // Check how close this semi-transparent edge pixel is to the studio backdrop color `[bgR, bgG, bgB]`
          const dBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          let alphaNorm = a / 255;
          if (dBg < 48) {
            // Tighten alpha on pixels that are mostly studio-wall grey so the rough fringe disappears
            const choke = 1.9 - (dBg / 48) * 0.7;
            alphaNorm = Math.pow(alphaNorm, choke);
          }
          finalAlpha = alphaNorm < 0.06 ? 0 : Math.min(255, Math.round(alphaNorm * 255));

          // Color decontamination (unmix studio backdrop color `[bgR, bgG, bgB]` from edge pixels)
          if (finalAlpha > 0 && finalAlpha < 242) {
            const effA = Math.max(0.28, finalAlpha / 255);
            r = Math.max(0, Math.min(255, Math.round((r - (1 - effA) * bgR) / effA)));
            g = Math.max(0, Math.min(255, Math.round((g - (1 - effA) * bgG) / effA)));
            b = Math.max(0, Math.min(255, Math.round((b - (1 - effA) * bgB) / effA)));
          }
        }
      } else {
        // Lower shoulder/jacket zone:
        if (bgMask && bgMask[pIdx] && a < 210) {
          finalAlpha = 0;
        } else {
          let maskAlpha = 0;
          if (a <= lowCut) {
            maskAlpha = 0;
          } else if (a >= highCut) {
            maskAlpha = 255;
          } else {
            const t = (a - lowCut) / span;
            maskAlpha = Math.round(t * t * (3 - 2 * t) * 255);
          }

          if (x >= lEdge && x <= rEdge) {
            const distToEdge = Math.min(x - lEdge, rEdge - x);
            const spanAlpha =
              distToEdge >= feather
                ? 255
                : Math.round(((distToEdge + 1) / (feather + 1)) * 255);
            const targetAlpha = Math.max(maskAlpha, spanAlpha);
            finalAlpha = Math.round(a * (1 - zoneWeight) + targetAlpha * zoneWeight);
          } else {
            finalAlpha = Math.round(a * (1 - zoneWeight) + maskAlpha * zoneWeight);
          }
        }
      }

      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = finalAlpha;
    }
  }

  ctx.putImageData(out, 0, 0);
  const cleanBlob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );

  // Build a 3-panel diagnostic stage strip (1: Pre-pass input, 2: Raw ISNet mask, 3: Final cutout on purple)
  let stagesDataUrl = null;
  if (IS_DEBUG_ENABLED && detectBlob) {
    try {
      const detectImg = await loadImageFromBlob(detectBlob);
      const cleanImg = await loadImageFromBlob(cleanBlob);
      const thumbH = 220;
      const thumbW = Math.round((w / h) * thumbH);
      const strip = document.createElement("canvas");
      strip.width = thumbW * 3 + 16;
      strip.height = thumbH + 26;
      const sctx = strip.getContext("2d");
      sctx.fillStyle = "#12102c";
      sctx.fillRect(0, 0, strip.width, strip.height);

      // Panel 1: Pre-pass input to ISNet
      sctx.drawImage(detectImg, 0, 24, thumbW, thumbH);
      // Panel 2: Raw ISNet mask
      sctx.drawImage(maskImg, thumbW + 8, 24, thumbW, thumbH);
      // Panel 3: Final cutout over WPPT purple
      sctx.fillStyle = "#5e53c0";
      sctx.fillRect((thumbW + 8) * 2, 24, thumbW, thumbH);
      sctx.drawImage(cleanImg, (thumbW + 8) * 2, 24, thumbW, thumbH);

      sctx.fillStyle = "#ffffff";
      sctx.font = "600 11px system-ui, sans-serif";
      sctx.fillText("1. ISNet Pre-pass", 6, 16);
      sctx.fillText("2. Raw ISNet Output", thumbW + 14, 16);
      sctx.fillText("3. Final Cutout", (thumbW + 8) * 2 + 6, 16);
      stagesDataUrl = strip.toDataURL("image/png");
    } catch {
      /* ignore stage strip error */
    }
  }

  return { cleanBlob, stagesDataUrl };
}

async function runCutoutLocal(file) {
  if (!guestPhotoApplied) {
    setStatus("Apply the photo to the preview first.", true);
    return;
  }
  btnCutoutLocal.disabled = true;
  btnApply.disabled = true;
  broadcastCutoutProcessing(true);
  setStatus("Removing background locally (full-precision ISNet)…");
  const t0 = performance.now();
  try {
    const {
      detectBlob,
      origImageData,
      w,
      h,
      isDarkBackdrop,
      isPureBlackBackdrop,
      bgRgb,
      bgMask,
      telemetry,
    } = await buildShadowBoostedInput(file);
    const { cleanBlob, stagesDataUrl } = await removeBackground(detectBlob, {
      model: "medium",
      output: { format: "image/png", quality: 1 },
      progress: (key, current, total) => {
        if (total) {
          setStatus(`Cutout: ${key} ${Math.round((current / total) * 100)}%`);
        }
      },
    }).then((rawCutoutBlob) =>
      compositeCleanCutout(
        rawCutoutBlob,
        origImageData,
        w,
        h,
        isDarkBackdrop,
        isPureBlackBackdrop,
        bgRgb,
        bgMask,
        detectBlob
      )
    );
    revokeGuestUrl();
    guestObjectUrl = URL.createObjectURL(cleanBlob);
    guestSrc = guestObjectUrl;
    broadcast();

    debugState.cutout = {
      ...telemetry,
      durationMs: Math.round(performance.now() - t0),
    };
    updateDebugUI(
      stagesDataUrl ? { cutoutStagesDataUrl: stagesDataUrl } : {}
    );

    setStatus(
      isDarkBackdrop
        ? "Cutout applied (head-safe studio backdrop boost)."
        : "Cutout applied."
    );
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    broadcastCutoutProcessing(false);
    btnCutoutLocal.disabled = false;
    btnApply.disabled = false;
  }
}

/**
 * Extract exact rendered line strings and coordinates from a DOM element
 * using Range.getClientRects(), so canvas export matches CSS text-wrap: balance 1:1.
 */
function extractRenderedLines(el, toLogicalRect) {
  const doc = el.ownerDocument;
  const lines = [];
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let currentLine = null;

  let textNode;
  while ((textNode = walker.nextNode())) {
    const str = textNode.nodeValue || "";
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "\r" || ch === "\n") continue;
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = toLogicalRect(rects[0]);
      if (r.width === 0 && r.height === 0 && ch.trim() === "") continue;

      if (!currentLine || Math.abs(r.top - currentLine.top) > 10) {
        if (currentLine) {
          currentLine.text = currentLine.text.replace(/^\s+|\s+$/g, "");
          if (currentLine.text) lines.push(currentLine);
        }
        currentLine = {
          text: ch,
          left: r.left,
          top: r.top,
          height: r.height,
        };
      } else {
        currentLine.text += ch;
        if (r.left < currentLine.left && ch.trim() !== "") {
          currentLine.left = r.left;
        }
      }
    }
  }
  if (currentLine) {
    currentLine.text = currentLine.text.replace(/^\s+|\s+$/g, "");
    if (currentLine.text) lines.push(currentLine);
  }
  return lines;
}

async function exportPngClientSide() {
  setStatus("Rendering PNG in browser (2560×1440)…");
  const w = CANVAS_W * EXPORT_SCALE;
  const h = CANVAS_H * EXPORT_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

  const loadImg = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });

  // Read live DOM geometry from the preview iframe so export matches preview 1:1
  const iframeDoc = iframes[0]?.contentDocument;
  const rootEl = iframeDoc?.querySelector("[data-asset-canvas]");
  const rootRect = rootEl?.getBoundingClientRect();
  const scaleX = rootRect && rootRect.width > 0 ? rootRect.width / CANVAS_W : 1;
  const scaleY = rootRect && rootRect.height > 0 ? rootRect.height / CANVAS_H : 1;

  const toLogicalRect = (domRect) => {
    if (!domRect || !rootRect) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    const left = (domRect.left - rootRect.left) / scaleX;
    const top = (domRect.top - rootRect.top) / scaleY;
    const width = domRect.width / scaleX;
    const height = domRect.height / scaleY;
    return { left, top, width, height, right: left + width, bottom: top + height };
  };
  const rectOf = (sel) => {
    const el = iframeDoc?.querySelector(sel);
    return el ? toLogicalRect(el.getBoundingClientRect()) : null;
  };

  // 1. Background gradient (118deg-ish diagonal)
  const angleRad = ((118 - 90) * Math.PI) / 180;
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const halfLen =
    (Math.abs(CANVAS_W * Math.cos(angleRad)) +
      Math.abs(CANVAS_H * Math.sin(angleRad))) /
    2;
  const gx0 = cx - Math.cos(angleRad) * halfLen;
  const gy0 = cy - Math.sin(angleRad) * halfLen;
  const gx1 = cx + Math.cos(angleRad) * halfLen;
  const gy1 = cy + Math.sin(angleRad) * halfLen;
  const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);

  const GRAD_STOPS = {
    signature: [
      [0, "#1a1640"],
      [0.22, "#38307f"],
      [0.48, "#5e53c0"],
      [0.72, "#7c3fb8"],
      [0.88, "#a81de9"],
      [1, "#c45ce0"],
    ],
    purple: [
      [0, "#12102c"],
      [0.34, "#2a2460"],
      [0.66, "#5e53c0"],
      [0.86, "#7068cc"],
      [1, "#847cd8"],
    ],
    gold: [
      [0, "#18142e"],
      [0.28, "#3a3250"],
      [0.52, "#6a5838"],
      [0.76, "#fed000"],
      [1, "#ffe566"],
    ],
    orchid: [
      [0, "#140c24"],
      [0.32, "#381858"],
      [0.58, "#782098"],
      [0.8, "#a81de9"],
      [1, "#c060f0"],
    ],
    magenta: [
      [0, "#14081c"],
      [0.3, "#401040"],
      [0.58, "#882868"],
      [0.82, "#c751c0"],
      [1, "#dc78cc"],
    ],
    blue: [
      [0, "#0c1020"],
      [0.32, "#1c2860"],
      [0.58, "#304890"],
      [0.8, "#4158d0"],
      [1, "#5870e8"],
    ],
  };
  for (const [stop, col] of GRAD_STOPS[selectedGradientId] || GRAD_STOPS.signature) {
    grad.addColorStop(stop, col);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 2. Overlay pattern + radial vignette
  const patSpec = OVERLAY_PATTERNS.find((p) => p.id === selectedPatternId);
  if (patSpec?.preview) {
    try {
      const patImg = await loadImg(patSpec.preview);
      ctx.save();
      if (selectedPatternId === "bokeh") {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.2;
      } else if (selectedPatternId === "code") {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.52;
      } else if (selectedPatternId === "stars") {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.3;
        ctx.filter = "saturate(0.45) contrast(1.25) brightness(1.18)";
      } else if (selectedPatternId === "milky-way") {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.75;
      } else if (selectedPatternId === "nebula") {
        ctx.globalCompositeOperation = "color-dodge";
        ctx.globalAlpha = 1;
      }
      const padX = CANVAS_W * 0.04;
      const padY = CANVAS_H * 0.04;
      ctx.drawImage(patImg, -padX, -padY, CANVAS_W + padX * 2, CANVAS_H + padY * 2);
      ctx.restore();
    } catch {
      /* ignore pattern error */
    }
  }

  // Vignette matching .wpep-vignette
  ctx.save();
  const vig = ctx.createRadialGradient(
    CANVAS_W * 0.7,
    CANVAS_H * 0.5,
    CANVAS_W * 0.28,
    CANVAS_W * 0.7,
    CANVAS_H * 0.5,
    CANVAS_W * 0.85
  );
  vig.addColorStop(0, "rgba(23, 19, 41, 0)");
  vig.addColorStop(1, "rgba(23, 19, 41, 0.45)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();

  // 3. White featured card (from live DOM rect)
  const cardR = rectOf(".wpep-card") || {
    left: 44,
    top: 34,
    width: Math.round(CANVAS_W * 0.62),
    height: CANVAS_H - 68,
  };
  ctx.save();
  ctx.shadowColor = "rgba(56, 48, 127, 0.35)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(cardR.left, cardR.top, cardR.width, cardR.height, 18);
  ctx.fill();
  ctx.restore();

  // 4. Wordmark in top-left (from live DOM rect)
  const wmR = rectOf(".wpep-wordmark") || { left: cardR.left + 42, top: cardR.top + 28, width: 218, height: 58 };
  const wordmarkUrl = "./cover/assets/wppt-wordmark.svg";
  try {
    const wmImg = await loadImg(wordmarkUrl);
    ctx.drawImage(wmImg, wmR.left, wmR.top, wmR.width, wmR.height);
  } catch {
    /* ignore */
  }

  // 5. Right-aligned inline EPISODE pill + LIVE! badge (from live DOM rects)
  const fp = fieldPayload();
  const epR = rectOf(".wpep-eyebrow");
  const liveR = rectOf(".wpep-live");
  ctx.save();
  if (epR) {
    ctx.fillStyle = "rgba(94, 83, 192, 0.14)";
    ctx.beginPath();
    ctx.roundRect(epR.left, epR.top, epR.width, epR.height, 999);
    ctx.fill();
    ctx.fillStyle = "#38307f";
    ctx.font = '800 18.9px "Noto Sans", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fp.eyebrow.toUpperCase(), epR.left + epR.width / 2, epR.top + epR.height / 2 + 1);
  }
  if (liveR) {
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.roundRect(liveR.left, liveR.top, liveR.width, liveR.height, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(liveR.left + 17.6 + 5.2, liveR.top + liveR.height / 2, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '800 18.9px "Noto Sans", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fp.live, liveR.left + 17.6 + 10.4 + 8, liveR.top + liveR.height / 2 + 1);
  }
  ctx.restore();

  // 6. Title + Yellow Swash + Guest line + Sparkles (exact lines & positions from live DOM)
  ctx.save();
  const titleEl = iframeDoc?.querySelector(".wpep-title");
  let exportedTitleLines = [];
  let exportedTitleFontPx = 66;
  let titleStepTrace = [];
  if (titleEl) {
    const cs = iframeDoc.defaultView.getComputedStyle(titleEl);
    exportedTitleFontPx = parseFloat(cs.fontSize) || 66;
    try {
      titleStepTrace = JSON.parse(titleEl.dataset.fitTrace || "[]");
    } catch {
      titleStepTrace = [];
    }
    ctx.font = `700 ${exportedTitleFontPx}px "Noto Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#171329";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const domLines = extractRenderedLines(titleEl, toLogicalRect);
    exportedTitleLines = domLines.map((ln) => ({
      text: ln.text,
      left: Math.round(ln.left * 10) / 10,
      top: Math.round(ln.top * 10) / 10,
      widthPx: Math.round(ctx.measureText(ln.text).width),
    }));
    for (const ln of domLines) {
      ctx.fillText(ln.text, ln.left, ln.top);
    }
  }

  const swashR = rectOf(".wpep-swash");
  if (swashR && swashR.width > 0) {
    const swashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="18" viewBox="0 0 360 18" fill="none"><path d="M4 13.5 C86 3.2, 224 2.4, 356 12.2 C252 7.8, 114 8.4, 18 15.6 C10 16.1, 3 14.8, 4 13.5 Z" fill="#FED000"/></svg>`;
    try {
      const swImg = await loadImg(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(swashSvg)}`
      );
      ctx.drawImage(swImg, swashR.left, swashR.top, swashR.width, swashR.height);
    } catch {
      /* ignore */
    }
  }

  const prefixEl = iframeDoc?.querySelector(".wpep-lede__prefix");
  const prefixR = rectOf(".wpep-lede__prefix");
  if (prefixEl && prefixR) {
    const pCs = iframeDoc.defaultView.getComputedStyle(prefixEl);
    const pPx = parseFloat(pCs.fontSize) || 21.6;
    ctx.font = `600 ${pPx}px "Noto Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#4a5568";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(fp.guestPrefix || "with special guest:", prefixR.left, prefixR.top);
  }

  const nameEl = iframeDoc?.querySelector(".wpep-lede__name");
  if (nameEl) {
    const nCs = iframeDoc.defaultView.getComputedStyle(nameEl);
    const nPx = parseFloat(nCs.fontSize) || 36.8;
    ctx.font = `800 ${nPx}px "Noto Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#38307f";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const nameLines = extractRenderedLines(nameEl, toLogicalRect);
    for (const ln of nameLines) {
      ctx.fillText(ln.text, ln.left, ln.top);
    }
  }

  const spR = rectOf(".wpep-lede__sparkles");
  if (spR && spR.width > 0) {
    const sparkleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="54" viewBox="0 0 180 54" fill="none">
      <g transform="translate(18 8) rotate(-14) scale(0.95)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#7c5ce6"/></g>
      <g transform="translate(68 42) rotate(12) scale(0.55)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#e879a8"/></g>
      <g transform="translate(106 10) rotate(-18) scale(0.85)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#7c5ce6"/></g>
      <g transform="translate(124 41) rotate(16) scale(1.08)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#e879a8"/></g>
      <g transform="translate(154 22) rotate(-10) scale(0.78)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#a81de9"/></g>
      <g transform="translate(169 37) rotate(22) scale(0.48)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#7c5ce6"/></g>
      <g transform="translate(142 8) rotate(8) scale(0.42)"><path d="M0 -9 C1.8 -1.8 1.8 -1.8 9 0 C1.8 1.8 1.8 1.8 0 9 C-1.8 1.8 -1.8 1.8 -9 0 C-1.8 -1.8 -1.8 -1.8 0 -9Z" fill="#e879a8"/></g>
    </svg>`;
    try {
      const spImg = await loadImg(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sparkleSvg)}`
      );
      ctx.drawImage(spImg, spR.left, spR.top, spR.width, spR.height);
    } catch {
      /* ignore */
    }
  }
  ctx.restore();

  // 7. Co-hosts section (exact positions from live DOM)
  const cohostsWrapEl = iframeDoc?.getElementById("wppt-cohosts-wrap");
  if (cohostsWrapEl && !cohostsWrapEl.hidden) {
    const wrapR = toLogicalRect(cohostsWrapEl.getBoundingClientRect());
    ctx.strokeStyle = "rgba(56, 48, 127, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wrapR.left, wrapR.top);
    ctx.lineTo(wrapR.right, wrapR.top);
    ctx.stroke();

    const labelR = rectOf(".wpep-cohosts-label");
    if (labelR) {
      ctx.fillStyle = "#4a5568";
      ctx.font = '800 14.7px "Noto Sans", system-ui, sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("WITH CO-HOSTS:", labelR.left, labelR.top);
    }

    const ringColors = {
      matt: "#38307f",
      katie: "#5e53c0",
      zack: "#a81de9",
      ian: "#fed000",
    };
    const cohosts = selectedCohosts();
    const domCohosts = [...iframeDoc.querySelectorAll(".wpep-cohost")];
    for (let i = 0; i < domCohosts.length; i++) {
      const itemEl = domCohosts[i];
      const hObj = cohosts[i];
      if (!hObj) continue;

      if (domCohosts.length < 4 && i > 0) {
        const itemR = toLogicalRect(itemEl.getBoundingClientRect());
        ctx.strokeStyle = "rgba(56, 48, 127, 0.2)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(itemR.left, itemR.top + 6);
        ctx.lineTo(itemR.left, itemR.bottom - 6);
        ctx.stroke();
      }

      const ringEl = itemEl.querySelector(".wpep-cohost__ring");
      const nameEl = itemEl.querySelector(".wpep-cohost__name");
      if (ringEl) {
        const rRect = toLogicalRect(ringEl.getBoundingClientRect());
        const rad = rRect.width / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(rRect.left + rad, rRect.top + rad, rad, 0, Math.PI * 2);
        ctx.fillStyle = ringColors[hObj.id] || "#38307f";
        ctx.fill();
        ctx.clip();
        try {
          const hImg = await loadImg(hObj.photo);
          ctx.drawImage(hImg, rRect.left, rRect.top, rRect.width, rRect.height);
        } catch {
          /* ignore */
        }
        ctx.restore();
      }
      if (nameEl) {
        const nRect = toLogicalRect(nameEl.getBoundingClientRect());
        const nCs = iframeDoc.defaultView.getComputedStyle(nameEl);
        const nPx = parseFloat(nCs.fontSize) || 18.4;
        ctx.fillStyle = "#171329";
        ctx.font = `700 ${nPx}px "Noto Sans", system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(hObj.name, nRect.left, nRect.top + nRect.height / 2);
      }
    }
  }

  // 8. Footer bar + date (from live DOM rects)
  const footR = rectOf(".wpep-foot");
  if (footR) {
    ctx.strokeStyle = "rgba(56, 48, 127, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(footR.left, footR.top);
    ctx.lineTo(footR.right, footR.top);
    ctx.stroke();
  }

  const barR = rectOf(".wpep-bar");
  if (barR) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(barR.left, barR.top, barR.width, barR.height, 999);
    ctx.clip();
    const w1 = barR.width * 0.58;
    const w2 = barR.width * 0.24;
    const w3 = barR.width - w1 - w2;
    ctx.fillStyle = "#5e53c0";
    ctx.fillRect(barR.left, barR.top, w1, barR.height);
    ctx.fillStyle = "#fed000";
    ctx.fillRect(barR.left + w1, barR.top, w2, barR.height);
    ctx.fillStyle = "#a81de9";
    ctx.fillRect(barR.left + w1 + w2, barR.top, w3, barR.height);
    ctx.restore();
  }

  const dateR = rectOf(".wpep-foot .wpep-meta");
  if (dateR) {
    ctx.fillStyle = "#171329";
    ctx.font = '700 18.4px "Noto Sans", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fp.date, dateR.left, dateR.top + dateR.height / 2);
  }

  // 9. Guest photo on right (exact rendered rect from live DOM #wppt-guest)
  const gSrc = guestSrc || "./cover/assets/guest-placeholder.svg";
  const guestImgR = rectOf("#wppt-guest");
  let guestExportDraw = null;
  try {
    const gImg = await loadImg(gSrc);
    if (guestImgR && guestImgR.width > 0 && guestImgR.height > 0) {
      // Because #wppt-guest uses object-fit: contain; object-position: bottom center;
      // compute the contained image box inside guestImgR
      const scaleFit = Math.min(
        guestImgR.width / gImg.naturalWidth,
        guestImgR.height / gImg.naturalHeight
      );
      const drawW = gImg.naturalWidth * scaleFit;
      const drawH = gImg.naturalHeight * scaleFit;
      const drawX = guestImgR.left + (guestImgR.width - drawW) / 2;
      const drawY = guestImgR.bottom - drawH;
      guestExportDraw = {
        natural: `${gImg.naturalWidth}x${gImg.naturalHeight}`,
        domRect: {
          left: Math.round(guestImgR.left),
          top: Math.round(guestImgR.top),
          width: Math.round(guestImgR.width),
          height: Math.round(guestImgR.height),
        },
        drawnRect: {
          x: Math.round(drawX),
          y: Math.round(drawY),
          w: Math.round(drawW),
          h: Math.round(drawH),
        },
        nudge: { ...guestOffset },
      };
      ctx.save();
      ctx.shadowColor = "rgba(23, 19, 41, 0.35)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
      ctx.drawImage(gImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    }
  } catch {
    /* ignore */
  }

  debugState.layout = {
    rawTitle: fp.title,
    titleCharCount: fp.title.length,
    chosenFontPx: exportedTitleFontPx,
    lineCount: exportedTitleLines.length,
    stepTrace: titleStepTrace,
    renderedLines: exportedTitleLines,
    cardRect: {
      left: Math.round(cardR.left),
      top: Math.round(cardR.top),
      width: Math.round(cardR.width),
      height: Math.round(cardR.height),
    },
  };
  debugState.export = {
    canvasSize: `${w}x${h}`,
    scaleFactor: Math.round(scaleX * 1000) / 1000,
    gradient: selectedGradientId,
    pattern: selectedPatternId,
    cohostCount: selectedCohosts().length,
    guest: guestExportDraw,
  };
  const exportDataUrl = IS_LOCAL_LAB_SERVER ? canvas.toDataURL("image/png") : undefined;
  updateDebugUI(exportDataUrl ? { exportDataUrl } : {});

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const name = exportFilename();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Downloaded ${name} (browser render).`);
}

async function generatePng() {
  btnGeneratePng.disabled = true;
  try {
    await exportPngClientSide();
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    btnGeneratePng.disabled = false;
  }
}

function syncGradientTiles() {
  if (!gradientPicker) return;
  for (const btn of gradientPicker.querySelectorAll("[data-gradient-id]")) {
    const on = btn.dataset.gradientId === selectedGradientId;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  }
}

function syncPatternTiles() {
  if (!patternPicker) return;
  for (const btn of patternPicker.querySelectorAll("[data-pattern-id]")) {
    const on = btn.dataset.patternId === selectedPatternId;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  }
}

function paintPatternSwatch(swatch, pat, gradBehind) {
  if (!swatch) return;
  swatch.style.background = gradBehind;
  swatch.style.backgroundSize = "cover";
  swatch.style.backgroundPosition = "center";
  swatch.style.backgroundBlendMode = "";
  swatch.style.filter = "";
  swatch.style.opacity = "";
  if (pat.placeholder || !pat.preview) {
    swatch.style.backgroundImage = gradBehind;
    return;
  }
  swatch.style.backgroundImage = `url("${pat.preview}"), ${gradBehind}`;
  if (pat.id === "bokeh") {
    swatch.style.backgroundBlendMode = "normal, normal";
  } else if (pat.id === "code") {
    swatch.style.backgroundBlendMode = "screen, normal";
  } else if (pat.id === "stars") {
    swatch.style.backgroundBlendMode = "screen, normal";
    swatch.style.filter = "saturate(0.45) contrast(1.25) brightness(1.18)";
  } else if (pat.id === "milky-way") {
    swatch.style.backgroundBlendMode = "screen, normal";
  } else if (pat.id === "nebula") {
    swatch.style.backgroundBlendMode = "color-dodge, normal";
  }
}

function buildPatternPicker() {
  if (!patternPicker) return;
  const gradBehind = gradientCss();
  for (const pat of OVERLAY_PATTERNS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wppt-lab__gradient-tile wppt-lab__pattern-tile";
    btn.dataset.patternId = pat.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", pat.id === selectedPatternId ? "true" : "false");
    btn.setAttribute("aria-label", pat.label);
    if (pat.id === selectedPatternId) btn.classList.add("is-selected");
    const swatchExtra =
      pat.id === "none"
        ? " wppt-lab__pattern-swatch--none"
        : pat.placeholder
          ? " wppt-lab__pattern-swatch--placeholder"
          : "";
    btn.innerHTML = `
      <span class="wppt-lab__gradient-swatch wppt-lab__pattern-swatch${swatchExtra}"></span>
      <span class="wppt-lab__gradient-label">${pat.label}</span>
    `;
    paintPatternSwatch(btn.querySelector(".wppt-lab__pattern-swatch"), pat, gradBehind);
    btn.addEventListener("click", () => {
      selectedPatternId = pat.id;
      syncPatternTiles();
      broadcast();
    });
    patternPicker.append(btn);
  }
}

function buildGradientPicker() {
  if (!gradientPicker) return;
  for (const grad of BACKGROUND_GRADIENTS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wppt-lab__gradient-tile";
    btn.dataset.gradientId = grad.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", grad.id === selectedGradientId ? "true" : "false");
    btn.setAttribute("aria-label", grad.label);
    if (grad.id === selectedGradientId) btn.classList.add("is-selected");
    btn.innerHTML = `
      <span class="wppt-lab__gradient-swatch" style="background: ${grad.css}"></span>
      <span class="wppt-lab__gradient-label">${grad.label}</span>
    `;
    btn.addEventListener("click", () => {
      selectedGradientId = grad.id;
      syncGradientTiles();
      rebuildPatternSwatchBackgrounds();
      broadcast();
    });
    gradientPicker.append(btn);
  }
}

function rebuildPatternSwatchBackgrounds() {
  if (!patternPicker) return;
  const gradBehind = gradientCss();
  for (const pat of OVERLAY_PATTERNS) {
    const swatch = patternPicker.querySelector(`[data-pattern-id="${pat.id}"] .wppt-lab__pattern-swatch`);
    paintPatternSwatch(swatch, pat, gradBehind);
  }
}

function buildCohostPicker() {
  if (!cohostPicker) return;
  for (const host of hostsCatalog) {
    const startOn = host.id === "matt" || host.id === "katie";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `wppt-lab__cohost-tile${startOn ? " is-selected" : ""}`;
    btn.dataset.cohostId = host.id;
    btn.setAttribute("aria-pressed", startOn ? "true" : "false");
    btn.innerHTML = `
      <span class="wppt-lab__cohost-ring wppt-lab__cohost-ring--${host.id}">
        <img src="${COHOST_ASSET_ROOT}${host.photo}" alt="" width="40" height="40" />
      </span>
      <span class="wppt-lab__cohost-name">${host.name}</span>
    `;
    btn.addEventListener("click", () => {
      const next = !btn.classList.contains("is-selected");
      btn.classList.toggle("is-selected", next);
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      broadcast();
    });
    cohostPicker.append(btn);
  }
}

for (const el of Object.values(fields)) {
  el.addEventListener("input", broadcast);
}

function onNudge() {
  guestOffset.x = Number(guestX?.value) || 0;
  guestOffset.y = Number(guestY?.value) || 0;
  const pct = Number(guestScale?.value);
  guestOffset.scale = Number.isFinite(pct) ? pct / 100 : 1;
  syncNudgeOutputs();
  broadcast();
}

guestX?.addEventListener("input", onNudge);
guestY?.addEventListener("input", onNudge);
guestScale?.addEventListener("input", onNudge);
syncNudgeOutputs();

btnApply.addEventListener("click", () => {
  const file = ensureFile();
  if (file) applyPhoto(file);
});

btnCutoutLocal?.addEventListener("click", () => {
  const file = ensureFile();
  if (file) runCutoutLocal(file);
});

btnGeneratePng.addEventListener("click", () => {
  generatePng();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  guestFile = file;
  guestPhotoApplied = false;
  updateGuestActionUI();
  setStatus(`Selected ${file.name}. Click Apply photo when ready.`);
});

function initTabs() {
  const tablist = document.querySelector(".wppt-lab__tabs");
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll(".wppt-lab__tab-panel")];

  function activate(tabId) {
    for (const tab of tabs) {
      const on = tab.dataset.tab === tabId;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of panels) {
      const on = panel.id === `tab-panel-${tabId}`;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
    tab.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(tab);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = tabs[(i + 1) % tabs.length];
        next.focus();
        activate(next.dataset.tab);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = tabs[(i - 1 + tabs.length) % tabs.length];
        prev.focus();
        activate(prev.dataset.tab);
      }
    });
  }
}

async function init() {
  initTabs();
  updateGuestActionUI();
  buildGradientPicker();
  buildPatternPicker();
  try {
    const res = await fetch(HOSTS_JSON_URL);
    hostsCatalog = await res.json();
    buildCohostPicker();
  } catch (err) {
    setStatus(`Could not load co-host list: ${err.message}`, true);
  }
  mountFrames();
  broadcast();
  setStatus("Preview ready.");
}

init();
