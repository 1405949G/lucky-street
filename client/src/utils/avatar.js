/**
 * Avatar helpers — color vs image (Base64)
 */

export const PALETTE = [
  "#f59e0b", "#ef4444", "#22c55e", "#06b6d4", "#8b5cf6",
  "#ec4899", "#f97316", "#14b8a6", "#eab308", "#6366f1",
  "#0ea5e9", "#a855f7"
];

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (file.size > 400 * 1024) return reject(new Error("Image must be <400KB"));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function isBase64Image(s) {
  return typeof s === "string" && s.startsWith("data:image");
}
