/**
 * Optional cleanup when an image model paints a faux checkerboard grid.
 * Conservative: border band only — never flood through the subject.
 */
import sharp from "sharp";

function colorDist(a, b) {
  return (
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
  );
}

function matchesColor(r, g, b, ref, tol = 20) {
  return (
    Math.abs(r - ref[0]) <= tol &&
    Math.abs(g - ref[1]) <= tol &&
    Math.abs(b - ref[2]) <= tol
  );
}

function isNeutralGray(r, g, b) {
  return (
    r > 150 &&
    g > 150 &&
    b > 150 &&
    Math.max(r, g, b) - Math.min(r, g, b) < 28
  );
}

/**
 * @param {Buffer} buffer PNG/JPEG bytes from OpenRouter
 * @returns {Promise<{ buffer: Buffer, stripped: number }>}
 */
export async function stripFauxCheckerboard(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const sizes = [8, 10, 16, 20];
  let tileSize = 8;
  let bestScore = 0;
  const probe = Math.min(64, width, height);

  for (const ts of sizes) {
    let score = 0;
    for (let y = 0; y + ts < probe; y += ts) {
      for (let x = 0; x + ts < probe; x += ts) {
        const i1 = (y * width + x) * channels;
        const i2 = (y * width + (x + ts)) * channels;
        const c1 = [data[i1], data[i1 + 1], data[i1 + 2]];
        const c2 = [data[i2], data[i2 + 1], data[i2 + 2]];
        if (colorDist(c1, c2) > 25) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      tileSize = ts;
    }
  }

  if (bestScore < 3) {
    return { buffer, stripped: 0 };
  }

  const colorA = [data[0], data[1], data[2]];
  const i10 = tileSize * channels;
  const colorB = [data[i10], data[i10 + 1], data[i10 + 2]];
  if (!isNeutralGray(...colorA) || !isNeutralGray(...colorB)) {
    return { buffer, stripped: 0 };
  }
  if (colorDist(colorA, colorB) < 20) {
    return { buffer, stripped: 0 };
  }

  const margin = Math.max(tileSize * 2, Math.floor(Math.min(width, height) * 0.12));
  const inBorder = (x, y) =>
    x < margin || y < margin || x >= width - margin || y >= height - margin;

  let stripped = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inBorder(x, y)) continue;
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const tx = Math.floor(x / tileSize);
      const ty = Math.floor(y / tileSize);
      const ref = (tx + ty) % 2 === 0 ? colorA : colorB;
      if (matchesColor(r, g, b, ref)) {
        data[i + 3] = 0;
        stripped++;
      }
    }
  }

  if (stripped < width * height * 0.02) {
    return { buffer, stripped: 0 };
  }

  const out = await sharp(data, { raw: { width, height, channels } })
    .png()
    .toBuffer();
  return { buffer: out, stripped };
}
