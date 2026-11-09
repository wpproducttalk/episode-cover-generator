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
  return {
    eyebrow: ep ? `Episode ${ep}` : "WP Product Talk",
    title,
    guest: `with special guest: ${guest}`,
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

function broadcast() {
  const message = broadcastPayload();
  for (const frame of iframes) {
    frame.contentWindow?.postMessage(message, window.location.origin);
  }
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
 * Build a shadow-lifted detection image when the backdrop is very dark,
 * so ISNet sees a crisp shoulder/jacket boundary (e.g. luminance 8..17 vs 0)
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

  // Sample outer top/side border luminance to detect dark studio backgrounds
  let borderSum = 0;
  let borderCount = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
  const margin = Math.max(4, Math.floor(Math.min(w, h) * 0.04));
  for (let y = 0; y < Math.floor(h * 0.65); y += step) {
    for (const x of [margin, w - 1 - margin]) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      borderSum += lum;
      borderCount++;
    }
  }
  const avgBorderLum = borderCount > 0 ? borderSum / borderCount : 128;
  const isDarkBackdrop = avgBorderLum < 28;

  if (!isDarkBackdrop) {
    return { detectBlob: file, origImageData, w, h, isDarkBackdrop: false };
  }

  // Build a lookup table that keeps true black (0..3) at 0, and steeply lifts
  // dark clothing shadows (4..45 -> 35..175) with a γ=0.36 curve
  const lut = new Uint8ClampedArray(256);
  const floor = Math.min(4, Math.floor(avgBorderLum + 2));
  for (let v = 0; v < 256; v++) {
    if (v <= floor) {
      lut[v] = 0;
    } else {
      const norm = (v - floor) / (255 - floor);
      lut[v] = Math.min(255, Math.round(Math.pow(norm, 0.36) * 255));
    }
  }

  const boosted = ctx.createImageData(w, h);
  const bData = boosted.data;
  for (let i = 0; i < data.length; i += 4) {
    bData[i] = lut[data[i]];
    bData[i + 1] = lut[data[i + 1]];
    bData[i + 2] = lut[data[i + 2]];
    bData[i + 3] = data[i + 3];
  }
  ctx.putImageData(boosted, 0, 0);
  const detectBlob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  return { detectBlob, origImageData, w, h, isDarkBackdrop: true };
}

/**
 * Composite the segmentation mask onto the ORIGINAL unmodified pixels,
 * hardening midrange alpha so dark jackets/shoulders never turn translucent.
 */
async function compositeCleanCutout(maskBlob, origImageData, w, h, isDarkBackdrop) {
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

  // Ramp: below lowCut -> 0; above highCut -> 255 (solid interior, no ghosting)
  const lowCut = isDarkBackdrop ? 22 : 18;
  const highCut = isDarkBackdrop ? 88 : 140;
  const span = highCut - lowCut;

  for (let i = 0; i < orig.length; i += 4) {
    dst[i] = orig[i];
    dst[i + 1] = orig[i + 1];
    dst[i + 2] = orig[i + 2];
    const a = maskData[i + 3];
    if (a <= lowCut) {
      dst[i + 3] = 0;
    } else if (a >= highCut) {
      dst[i + 3] = 255;
    } else {
      const t = (a - lowCut) / span;
      dst[i + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
  }

  ctx.putImageData(out, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
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
  try {
    const { detectBlob, origImageData, w, h, isDarkBackdrop } =
      await buildShadowBoostedInput(file);
    const rawCutoutBlob = await removeBackground(detectBlob, {
      model: "isnet",
      output: { format: "image/png", quality: 1 },
      progress: (key, current, total) => {
        if (total) {
          setStatus(`Cutout: ${key} ${Math.round((current / total) * 100)}%`);
        }
      },
    });
    const cleanBlob = await compositeCleanCutout(
      rawCutoutBlob,
      origImageData,
      w,
      h,
      isDarkBackdrop
    );
    revokeGuestUrl();
    guestObjectUrl = URL.createObjectURL(cleanBlob);
    guestSrc = guestObjectUrl;
    broadcast();
    setStatus(
      isDarkBackdrop
        ? "Cutout applied (shadow-boosted mask for dark backdrop)."
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

  // 2. Overlay pattern
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

  // 3. White featured card (inset 40px 44px, max-width 58% = 742.4px)
  const cardX = 44;
  const cardY = 40;
  const cardW = Math.round(CANVAS_W * 0.58);
  const cardH = CANVAS_H - 80;
  ctx.save();
  ctx.shadowColor = "rgba(56, 48, 127, 0.35)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.restore();

  // 4. Wordmark in top-left
  const wordmarkUrl = "./cover/assets/wppt-wordmark.svg";
  try {
    const wmImg = await loadImg(wordmarkUrl);
    const wmH = 52;
    const wmW = (wmImg.naturalWidth / wmImg.naturalHeight) * wmH || 195;
    ctx.drawImage(wmImg, cardX + 40, cardY + 32, wmW, wmH);
  } catch {
    /* ignore */
  }

  // 5. Top-right Episode pill + LIVE badge
  const fp = fieldPayload();
  ctx.save();
  ctx.font = '700 13.1px "Noto Sans", system-ui, sans-serif';
  const epText = fp.eyebrow.toUpperCase();
  const epMetrics = ctx.measureText(epText);
  const pillW = epMetrics.width + 26;
  const pillH = 26;
  const pillX = cardX + cardW - 40 - pillW;
  const pillY = cardY + 32;
  ctx.fillStyle = "rgba(94, 83, 192, 0.12)";
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 999);
  ctx.fill();
  ctx.fillStyle = "#38307f";
  ctx.textBaseline = "middle";
  ctx.fillText(epText, pillX + 13, pillY + pillH / 2 + 1);

  const liveW = 48;
  const liveH = 22;
  const liveX = cardX + cardW - 40 - liveW;
  const liveY = pillY + pillH + 6;
  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  ctx.roundRect(liveX, liveY, liveW, liveH, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 11.5px "Noto Sans", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(fp.live, liveX + liveW / 2, liveY + liveH / 2 + 1);
  ctx.restore();

  // 6. Title + Guest line
  ctx.save();
  ctx.fillStyle = "#171329";
  ctx.font = '700 44px "Noto Sans", system-ui, sans-serif';
  ctx.textBaseline = "top";
  const maxTitleW = cardW - 80;
  const words = fp.title.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width > maxTitleW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  let textY = cardY + 178;
  for (const line of lines) {
    ctx.fillText(line, cardX + 40, textY);
    textY += 47.5;
  }

  textY += 10;
  ctx.font = '600 18px "Noto Sans", system-ui, sans-serif';
  ctx.fillStyle = "#4a5568";
  const prefix = "with special guest: ";
  ctx.fillText(prefix, cardX + 40, textY + 6);
  const prefixW = ctx.measureText(prefix).width;

  ctx.font = '800 26.4px "Noto Sans", system-ui, sans-serif';
  ctx.fillStyle = "#38307f";
  ctx.fillText(fp.guestName, cardX + 40 + prefixW, textY);
  ctx.restore();

  // 7. Co-hosts section
  const cohosts = selectedCohosts();
  if (cohosts.length > 0) {
    const ruleY = textY + 58;
    ctx.strokeStyle = "rgba(56, 48, 127, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 40, ruleY);
    ctx.lineTo(cardX + cardW - 40, ruleY);
    ctx.stroke();

    ctx.fillStyle = "#4a5568";
    ctx.font = '700 12.5px "Noto Sans", system-ui, sans-serif';
    ctx.fillText("WITH CO-HOSTS:", cardX + 40, ruleY + 24);

    const ringColors = {
      matt: "#38307f",
      katie: "#5e53c0",
      zack: "#a81de9",
      ian: "#fed000",
    };
    const startY = ruleY + 48;
    let curX = cardX + 40;
    let curY = startY;
    for (let i = 0; i < cohosts.length; i++) {
      const hObj = cohosts[i];
      if (cohosts.length >= 4 && i === 2) {
        curX = cardX + 40;
        curY = startY + 68;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(curX + 28, curY + 28, 28, 0, Math.PI * 2);
      ctx.fillStyle = ringColors[hObj.id] || "#38307f";
      ctx.fill();
      ctx.clip();
      try {
        const hImg = await loadImg(hObj.photo);
        ctx.drawImage(hImg, curX, curY, 56, 56);
      } catch {
        /* ignore */
      }
      ctx.restore();

      ctx.fillStyle = "#171329";
      ctx.font = '700 15.7px "Noto Sans", system-ui, sans-serif';
      ctx.textBaseline = "middle";
      ctx.fillText(hObj.name, curX + 65, curY + 28);
      curX += 65 + ctx.measureText(hObj.name).width + 20;
    }
  }

  // 8. Footer bar + date
  const footY = cardY + cardH - 54;
  ctx.strokeStyle = "rgba(56, 48, 127, 0.2)";
  ctx.beginPath();
  ctx.moveTo(cardX + 40, footY);
  ctx.lineTo(cardX + cardW - 40, footY);
  ctx.stroke();

  const barX = cardX + 40;
  const barY = footY + 22;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(barX, barY, 120, 10, 999);
  ctx.clip();
  ctx.fillStyle = "#5e53c0";
  ctx.fillRect(barX, barY, 70, 10);
  ctx.fillStyle = "#fed000";
  ctx.fillRect(barX + 70, barY, 29, 10);
  ctx.fillStyle = "#a81de9";
  ctx.fillRect(barX + 99, barY, 21, 10);
  ctx.restore();

  ctx.fillStyle = "#171329";
  ctx.font = '700 15.2px "Noto Sans", system-ui, sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText(fp.date, barX + 134, barY + 5);

  // 9. Guest photo on right
  const gSrc = guestSrc || "./cover/assets/guest-placeholder.svg";
  try {
    const gImg = await loadImg(gSrc);
    const boxW = CANVAS_W * 0.5 - 20;
    const boxH = CANVAS_H * 0.94;
    const scaleFit = Math.min(boxW / gImg.naturalWidth, boxH / gImg.naturalHeight);
    const drawW = gImg.naturalWidth * scaleFit * (guestOffset.scale || 1);
    const drawH = gImg.naturalHeight * scaleFit * (guestOffset.scale || 1);
    const drawX =
      CANVAS_W - 20 - boxW / 2 - drawW / 2 + (Number(guestOffset.x) || 0);
    const drawY = CANVAS_H - drawH + (Number(guestOffset.y) || 0);
    ctx.save();
    ctx.shadowColor = "rgba(23, 19, 41, 0.35)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(gImg, drawX, drawY, drawW, drawH);
    ctx.restore();
  } catch {
    /* ignore */
  }

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
  if (!IS_LOCAL_LAB_SERVER) {
    try {
      await exportPngClientSide();
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      btnGeneratePng.disabled = false;
    }
    return;
  }
  setStatus("Rendering PNG (headless Chrome)…");
  try {
    const guestData =
      guestSrc && !guestSrc.includes("guest-placeholder.svg")
        ? await blobUrlToDataUrl(guestSrc)
        : null;

    const res = await fetch("/api/export/png", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...broadcastPayload(),
        guestSrc: guestData,
        filename: exportFilename(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const t = formatTiming(err.timing);
      throw new Error(
        [err.message || err.error || `Export failed (${res.status})`, t]
          .filter(Boolean)
          .join(" ")
      );
    }

    const blob = await res.blob();
    const name = exportFilename();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    const timingHdr = res.headers.get("X-Wppt-Timing");
    const timingNote = timingHdr ? ` (${timingHdr})` : "";
    setStatus(`Downloaded ${name}.${timingNote}`);
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
