import React, { useEffect, useRef, useState } from "react";

/**
 * DessinCanvas.jsx
 * - mode: "free" | "line" | "text"
 * - penSize: 1 | 2 | 3   (1x normal, 2x, 3x)
 * - onExportPNG(dataUrl) => retourne une MINIATURE WebP compressée (dataURL)
 */

function exportThumbDataUrl(canvas, opts = {}) {
  const {
    maxW = 320,
    maxH = 240,
    mime = "image/webp",
    quality = 0.45,
    background = "#ffffff",
  } = opts;

  const w = canvas.width;
  const h = canvas.height;

  // scale pour rentrer dans maxW x maxH
  const scale = Math.min(1, maxW / w, maxH / h);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const off = document.createElement("canvas");
  off.width = tw;
  off.height = th;

  const ctx = off.getContext("2d");

  // fond blanc (ça compresse mieux et évite transparence)
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, tw, th);

  ctx.drawImage(canvas, 0, 0, tw, th);

  // WebP super léger
  try {
    return off.toDataURL(mime, quality);
  } catch {
    // fallback si jamais webp non supporté
    return off.toDataURL("image/jpeg", 0.55);
  }
}

export default function DessinCanvas({
  mode = "free",
  onModeChange,
  clearSignal = 0,
  onExportPNG,
  width = 760,
  height = 520,

  // ✅ NOUVEAU: épaisseur du crayon (1x / 2x / 3x)
  penSize = 1,
}) {
  const canvasRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [last, setLast] = useState({ x: 0, y: 0 });
  const [lineStart, setLineStart] = useState(null);

  // ✅ base lineWidth (1x). 2x = *2, 3x = *3
  const BASE_WIDTH = 2;
  const strokeWidth = BASE_WIDTH * (Number(penSize) || 1);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#111";
    ctx.font = "18px Arial";

    // init
    ctx.lineWidth = strokeWidth;
  }, []); // eslint-disable-line

  // ✅ Si penSize change, on met à jour le ctx
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [strokeWidth]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    setLineStart(null);
    setIsDrawing(false);
  }, [clearSignal]);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function emitExport() {
    if (!onExportPNG) return;
    const c = canvasRef.current;
    if (!c) return;
    const thumb = exportThumbDataUrl(c, {
      maxW: 320,
      maxH: 240,
      mime: "image/webp",
      quality: 0.45,
      background: "#ffffff",
    });
    onExportPNG(thumb);
  }

  function begin(e) {
    e.preventDefault();
    const p = getPos(e);

    const c = canvasRef.current;
    const ctx = c.getContext("2d");

    // ✅ appliquer l'épaisseur à chaque action (sécuritaire)
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (mode === "text") {
      const t = (window.prompt("Texte à ajouter :", "") || "").trim();
      if (!t) return;

      ctx.fillText(t, p.x, p.y);
      emitExport();
      return;
    }

    if (mode === "line") {
      if (!lineStart) {
        setLineStart(p);
      } else {
        ctx.beginPath();
        ctx.moveTo(lineStart.x, lineStart.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        setLineStart(null);
        emitExport();
      }
      return;
    }

    // free
    setIsDrawing(true);
    setLast(p);
  }

  function move(e) {
    if (mode !== "free") return;
    if (!isDrawing) return;
    e.preventDefault();

    const p = getPos(e);
    const c = canvasRef.current;
    const ctx = c.getContext("2d");

    // ✅ épaisseur en live
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    setLast(p);
  }

  function end(e) {
    if (mode !== "free") return;
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    emitExport();
  }

  return (
    <div style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: "100%",
          height: "100%",
          background: "#fff",
          border: "1px solid #cfcfcf",
          touchAction: "none",
        }}
        onMouseDown={begin}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={begin}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </div>
  );
}
