import sharp from "sharp";

const MAX_EDGE = Number(process.env.WPPT_CUTOUT_MAX_EDGE || 1200);

/** Shrink large uploads before OpenRouter (faster + less hallucination). */
export async function prepareGuestDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return { dataUrl, resized: false };
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  const meta = await sharp(buf).metadata();
  const long = Math.max(meta.width || 0, meta.height || 0);
  if (long <= MAX_EDGE) {
    return { dataUrl, resized: false, bytes: buf.length };
  }
  const out = await sharp(buf)
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const mime = "image/jpeg";
  return {
    dataUrl: `data:${mime};base64,${out.toString("base64")}`,
    resized: true,
    bytes: out.length,
    from: `${meta.width}x${meta.height}`,
  };
}
