/**
 * Avatar helpers — color vs image
 * All images are compressed/resized client-side so avatar is small, fast, and never gets stuck
 */

export const PALETTE = [
  "#f59e0b", "#ef4444", "#22c55e", "#06b6d4", "#8b5cf6",
  "#ec4899", "#f97316", "#14b8a6", "#eab308", "#6366f1",
  "#0ea5e9", "#a855f7"
];

// Compress to ~256x256 JPEG ~0.75 quality — keeps avatar under ~80KB and instant over WebSocket
function compressImage(file, maxSize = 256, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      // fill white for JPEG (transparent PNG → white)
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

export function fileToBase64(file) {
  return new Promise(async (resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (!file.type.startsWith("image/")) return reject(new Error("Please upload an image"));
    // Early hard limit — even compressed, >5MB source is excessive
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Image too large — please pick a smaller photo"));

    try {
      // Always compress for consistency and to avoid "Checking..." stuck with large base64
      const compressed = await compressImage(file, 256, 0.75);
      // Safety: if still >120KB (base64 length), re-compress more aggressively
      if (compressed.length > 120 * 1024) {
        const recompressed = await compressImage(file, 192, 0.6);
        resolve(recompressed);
      } else {
        resolve(compressed);
      }
    } catch (e) {
      // Fallback to raw FileReader if canvas fails
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
