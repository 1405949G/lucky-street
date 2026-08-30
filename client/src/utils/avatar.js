/**
 * Avatar helpers - color vs image
 * All images are compressed/resized client-side so avatar is small, fast, and never gets stuck
 */

export const PALETTE = [
  "#f59e0b", "#ef4444", "#22c55e", "#06b6d4", "#8b5cf6",
  "#ec4899", "#f97316", "#14b8a6", "#eab308", "#6366f1",
  "#0ea5e9", "#a855f7"
];

// Compress to ~10KB target - tiny, instant over WebSocket / DO, no "Checking..." stall
// We shrink to 96-128px and JPEG 0.5-0.6, iterating until base64 < 15KB (~10KB binary)
function compressImage(file, maxSize = 128, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image"));
    };
    img.src = url;
  });
}

async function toTargetSize(file) {
  // Try progressively smaller/ lower quality until < ~14KB base64 (~10KB binary) or lowest quality reached
  const attempts = [
    { size: 128, q: 0.55 },
    { size: 112, q: 0.5 },
    { size: 96, q: 0.5 },
    { size: 80, q: 0.45 },
  ];
  for (const { size, q } of attempts) {
    const dataUrl = await compressImage(file, size, q);
    // dataUrl length includes "data:image/jpeg;base64," (~23 chars) + base64
    if (dataUrl.length < 14 * 1024) return dataUrl;
    // if still too big, try next smaller attempt
    // keep last as fallback
    if (size === 80) return dataUrl;
  }
  // fallback: return smallest
  return compressImage(file, 80, 0.45);
}

export function fileToBase64(file) {
  return new Promise(async (resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (!file.type.startsWith("image/")) return reject(new Error("Please upload an image"));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Image too large - please pick a smaller photo"));

    try {
      const compressed = await toTargetSize(file);
      // Final safety: if somehow still >14KB (shouldn't with 80px), force smallest
      if (compressed.length > 14 * 1024) {
        const tiny = await compressImage(file, 64, 0.4);
        resolve(tiny);
      } else {
        resolve(compressed);
      }
    } catch (e) {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    }
  });
}

export function isBase64Image(s) {
  return typeof s === "string" && s.startsWith("data:image");
}
