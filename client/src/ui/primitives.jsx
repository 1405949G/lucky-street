/**
 * ui/primitives.jsx — VISUAL PRIMITIVES (colours/shapes/icons only)
 * 
 * VISUAL AI: EDIT HERE. You may change Tailwind classes, colours, radii,
 * shadows, hover animations, and add icons (from ./theme.js icons).
 * DO NOT change children text — that comes from copy.js via props.
 * 
 * Example: <PrimaryButton> {copy.roomBrowser.newGame} </PrimaryButton>
 *          Visual AI may change bg, hover, scale, icon, but must keep children as-is.
 */

import React from "react";
import { theme } from "./theme.js";

// Card — opaque, visual-only
export function Card({ children, className = "", hover = false, ...props }) {
  return (
    <div className={`${theme.classes.card} ${hover ? theme.classes.cardHover : ""} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function ButtonPrimary({ children, className = "", ...props }) {
  return (
    <button className={`${theme.classes.buttonPrimary} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonGhost({ children, className = "", ...props }) {
  return (
    <button className={`${theme.classes.buttonGhost} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={`${theme.classes.input} ${className}`} {...props} />;
}

export function Badge({ children, className = "", ...props }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${className}`} {...props}>
      {children}
    </span>
  );
}

// Icon helper — visual only, no text change
export function Icon({ name, className = "", size = 16 }) {
  const glyph = theme.icons[name] || "•";
  // For emoji icons, just render glyph; for SVG, replace with inline SVG component
  return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{glyph}</span>;
}
