/**
 * WPPT episode cover lab — static asset-lab + PNG export.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { logTiming, startTiming } from "./timing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const assetLabRoot = resolve(here, "../..");
const wpptBrandRoot = resolve(
  assetLabRoot,
  "..",
  "..",
  "08-Products",
  "wp-product-talk",
  "brand"
);
const exportProject =
  "projects/wppt/images/2026-11-09-wppt-episode-compare-v1-glass/index.html";

const port = Number(process.env.WPPT_LAB_PORT || 4334);
const host = "127.0.0.1";
const CANVAS_W = 1280;
const CANVAS_H = 720;
const EXPORT_SCALE = 2;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeRel(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath.split("?")[0]).replace(/^\//, ""));
  if (rel.includes("..")) return null;
  return rel;
}

async function sendFile(res, abs, ext) {
  const body = await readFile(abs);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
  });
  res.end(body);
}

async function sendFromRoot(res, root, relPath) {
  const abs = resolve(root, relPath);
  if (!abs.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  let st;
  try {
    st = await stat(abs);
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }
  if (st.isDirectory()) {
    const index = join(abs, "index.html");
    if (existsSync(index)) return sendFromRoot(res, root, join(relPath, "index.html"));
    res.writeHead(404).end();
    return;
  }
  return sendFile(res, abs, extname(abs).toLowerCase());
}

async function exportCoverPng(body, timer) {
  const pageUrl = `http://${host}:${port}/${exportProject.replace(/\\/g, "/")}`;
  const payload = {
    type: "wppt-lab-update",
    fields: body.fields || {},
    guestSrc: body.guestSrc || null,
    guestOffset: body.guestOffset || { x: 0, y: 0, scale: 1 },
    cohosts: body.cohosts || [],
    backgroundGradient: body.backgroundGradient || null,
    overlayPattern: body.overlayPattern || "bokeh",
  };

  timer?.mark("puppeteer.launch");
  const browser = await puppeteer.launch({ headless: "shell" });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: CANVAS_W,
      height: CANVAS_H,
      deviceScaleFactor: EXPORT_SCALE,
    });
    timer?.mark("page.goto");
    await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 120_000 });
    timer?.mark("fonts.ready");
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate((msg) => {
      window.dispatchEvent(
        new MessageEvent("message", { data: msg, origin: window.location.origin })
      );
    }, payload);

    if (payload.guestSrc) {
      await page.evaluate((src) => {
        const img = document.getElementById("wppt-guest");
        if (img) img.src = src;
      }, payload.guestSrc);
    }

    timer?.mark("lab.state_apply");
    await page.evaluate(async () => {
      const img = document.getElementById("wppt-guest");
      if (img?.src && !img.src.endsWith("guest-placeholder.svg")) {
        try {
          await img.decode();
        } catch {
          /* ignore */
        }
      }
      for (const el of document.querySelectorAll(".wpep-cohost__photo")) {
        try {
          await el.decode();
        } catch {
          /* ignore */
        }
      }
      await document.fonts.ready;
    });

    timer?.mark("images.decode");
    const handle = await page.$("[data-asset-canvas]");
    if (!handle) {
      throw new Error("Canvas [data-asset-canvas] not found");
    }
    timer?.mark("screenshot");
    const png = await handle.screenshot({ type: "png" });
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const expectW = CANVAS_W * EXPORT_SCALE;
    const expectH = CANVAS_H * EXPORT_SCALE;
    if (w !== expectW || h !== expectH) {
      throw new Error(`Export size ${w}x${h}, expected ${expectW}x${expectH}`);
    }
    return png;
  } finally {
    await browser.close();
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/export/png") {
    const timer = startTiming();
    const body = await readBody(req);
    timer.mark("read_body");
    if (body === null) return json(res, 400, { error: "invalid_json" });
    try {
      const png = await exportCoverPng(body, timer);
      const timing = timer.finish("response");
      logTiming("export.png", timing, { bytes: png.length });
      const timingHdr = timing.steps
        .map((s) => `${s.step}=${s.ms}ms`)
        .join("; ");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${String(body.filename || "wppt-episode-cover.png").replace(/[^\w.-]+/g, "-")}"`,
        "Content-Length": png.length,
        "X-Wppt-Timing": `${timing.totalMs}ms total | ${timingHdr}`,
      });
      res.end(png);
    } catch (err) {
      const timing = timer.finish("error");
      logTiming("export.failed", timing, { error: err.message });
      return json(res, 500, {
        error: "export_failed",
        message: err.message || String(err),
        timing,
      });
    }
    return;
  }

  if (pathname === "/" || pathname === "/lab/wppt" || pathname === "/lab/wppt/") {
    res.writeHead(302, { Location: "/lab/wppt/index.html" });
    res.end();
    return;
  }

  if (pathname.startsWith("/_wppt-brand/")) {
    const rel = safeRel(pathname.slice("/_wppt-brand/".length));
    if (rel && req.method === "GET") {
      return sendFromRoot(res, wpptBrandRoot, rel);
    }
  }

  const rel = safeRel(pathname);
  if (rel && req.method === "GET") {
    return sendFromRoot(res, assetLabRoot, rel);
  }

  res.writeHead(404).end();
});

server.listen(port, host, () => {
  console.log(`WPPT cover lab: http://${host}:${port}/lab/wppt/`);
});
