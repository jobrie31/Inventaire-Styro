import React, { useEffect, useMemo, useRef, useState } from "react";

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

  const scale = Math.min(1, maxW / w, maxH / h);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const off = document.createElement("canvas");
  off.width = tw;
  off.height = th;

  const ctx = off.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(canvas, 0, 0, tw, th);

  try {
    return off.toDataURL(mime, quality);
  } catch {
    return off.toDataURL("image/jpeg", 0.55);
  }
}

export default function DessinCanvas({
  mode = "free",
  clearSignal = 0,
  undoSignal = 0,
  onExportPNG,
  width = 760,
  height = 520,
  penSize = 1,
}) {
  const wrapRef = useRef(null);
  const displayRef = useRef(null);
  const baseRef = useRef(null);

  // free draw
  const [isDrawing, setIsDrawing] = useState(false);
  const [last, setLast] = useState({ x: 0, y: 0 });

  // line drag
  const lineDragRef = useRef({ active: false, start: null, cur: null });

  // committed texts
  const [texts, setTexts] = useState([]);
  const textsRef = useRef([]);
  useEffect(() => {
    textsRef.current = texts;
  }, [texts]);

  // drag committed text
  const dragTextRef = useRef({ active: false, id: null, offX: 0, offY: 0 });

  // history (base + texts)
  const historyRef = useRef([]);
  const HISTORY_MAX = 30;

  // text overlay (editing box)
  const [textBox, setTextBox] = useState(null);
  const overlayDragRef = useRef({ active: false, offX: 0, offY: 0 });
  const inputRef = useRef(null);

  // stroke
  const BASE_WIDTH = 2;
  const strokeWidth = BASE_WIDTH * (Number(penSize) || 1);

  // texte
  const TEXT_PX = 80;
  const LINE_H = Math.round(TEXT_PX * 1.15);

  // ✅ SNAP 90° ± 2°
  const SNAP_DEG = 2;

  // overlay style
  const BOX_PAD_X = 10;
  const BOX_PAD_Y = 6;
  const BOX_MIN_W = 30;
  const BOX_MIN_H = 26;

  const CHECK_SIZE = 28;
  const CHECK_GAP = 10;

  // double-tap fallback (mobile)
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });

  function getDisplayCtx() {
    const c = displayRef.current;
    if (!c) return null;
    return c.getContext("2d");
  }

  function getBaseCtx() {
    const c = baseRef.current;
    if (!c) return null;
    return c.getContext("2d");
  }

  function applyStroke(ctx) {
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }

  function applyText(ctx) {
    ctx.fillStyle = "#111";
    ctx.font = `${TEXT_PX}px Arial`;
    ctx.textBaseline = "top";
  }

  function clearBaseToWhite() {
    const ctx = getBaseCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  function deepCopyTexts(list) {
    return (list || []).map((t) => ({ ...t }));
  }

  function pushHistorySnapshot(nextTexts) {
    const bctx = getBaseCtx();
    if (!bctx) return;
    try {
      const baseImageData = bctx.getImageData(0, 0, width, height);
      historyRef.current.push({
        baseImageData,
        texts: deepCopyTexts(nextTexts ?? textsRef.current),
      });
      if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    } catch {}
  }

  function restoreHistoryState(state) {
    const bctx = getBaseCtx();
    if (!bctx || !state?.baseImageData) return;
    bctx.putImageData(state.baseImageData, 0, 0);
    setTexts(deepCopyTexts(state.texts || []));
    render(null, state.texts || []);
  }

  function emitExport() {
    if (!onExportPNG) return;
    const c = displayRef.current;
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

  function getPosFromPointerEvent(e) {
    const rect = displayRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? 0;
    const clientY = e.clientY ?? 0;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function measureOneLine(text) {
    const ctx = getDisplayCtx();
    if (!ctx) return { w: BOX_MIN_W, h: BOX_MIN_H };
    applyText(ctx);

    const t = String(text ?? "");
    const w = Math.ceil(ctx.measureText(t.length ? t : " ").width);
    const h = LINE_H;
    return { w, h };
  }

  // ✅ snap endpoint to 0°/90° within ±SNAP_DEG
  function snapLineEnd(start, end) {
    if (!start || !end) return end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return end;

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const a = Math.abs(angle); // 0..180

    if (a <= SNAP_DEG || a >= 180 - SNAP_DEG) {
      return { x: end.x, y: start.y };
    }
    if (Math.abs(a - 90) <= SNAP_DEG) {
      return { x: start.x, y: end.y };
    }
    return end;
  }

  function render(previewLine = null, textsOverride = null) {
    const dctx = getDisplayCtx();
    const bctx = getBaseCtx();
    if (!dctx || !bctx) return;

    const list = textsOverride ?? textsRef.current;

    dctx.clearRect(0, 0, width, height);
    dctx.drawImage(baseRef.current, 0, 0);

    applyText(dctx);
    for (const t of list) dctx.fillText(t.text, t.x, t.y);

    if (previewLine?.start && previewLine?.end) {
      applyStroke(dctx);
      dctx.beginPath();
      dctx.moveTo(previewLine.start.x, previewLine.start.y);
      dctx.lineTo(previewLine.end.x, previewLine.end.y);
      dctx.stroke();
    }
  }

  // init
  useEffect(() => {
    const base = document.createElement("canvas");
    base.width = width;
    base.height = height;
    baseRef.current = base;

    clearBaseToWhite();
    historyRef.current = [];
    pushHistorySnapshot([]);

    render();
    emitExport();
    // eslint-disable-next-line
  }, []);

  // focus auto quand textBox ouvre
  useEffect(() => {
    if (!textBox) return;
    setTimeout(() => {
      inputRef.current?.focus();
      const v = inputRef.current?.value ?? "";
      try {
        inputRef.current?.setSelectionRange(v.length, v.length);
      } catch {}
    }, 0);
  }, [textBox]);

  // clear
  useEffect(() => {
    clearBaseToWhite();
    setIsDrawing(false);
    lineDragRef.current = { active: false, start: null, cur: null };
    dragTextRef.current = { active: false, id: null, offX: 0, offY: 0 };
    overlayDragRef.current = { active: false, offX: 0, offY: 0 };
    setTextBox(null);
    setTexts([]);

    historyRef.current = [];
    pushHistorySnapshot([]);
    render(null, []);
    emitExport();
    // eslint-disable-next-line
  }, [clearSignal]);

  // undo
  useEffect(() => {
    if (!undoSignal) return;

    setIsDrawing(false);
    lineDragRef.current = { active: false, start: null, cur: null };
    dragTextRef.current = { active: false, id: null, offX: 0, offY: 0 };
    overlayDragRef.current = { active: false, offX: 0, offY: 0 };
    setTextBox(null);

    const hist = historyRef.current;
    if (!hist || hist.length <= 1) {
      clearBaseToWhite();
      setTexts([]);
      historyRef.current = [];
      pushHistorySnapshot([]);
      render(null, []);
      emitExport();
      return;
    }

    hist.pop();
    restoreHistoryState(hist[hist.length - 1]);
    emitExport();
    // eslint-disable-next-line
  }, [undoSignal]);

  // ============== TEXT BOX ==============
  function openTextBoxAt(p) {
    setTextBox({ x: p.x, y: p.y, text: "", editingId: null });
  }

  function openTextBoxForEdit(textObj) {
    setTextBox({ x: textObj.x, y: textObj.y, text: textObj.text, editingId: textObj.id });
  }

  function closeTextBox() {
    setTextBox(null);
  }

  function commitTextBox() {
    if (!textBox) return;

    const t = (textBox.text || "").trim();
    if (!t) {
      closeTextBox();
      return;
    }

    if (textBox.editingId) {
      const list = textsRef.current;
      const idx = list.findIndex((x) => x.id === textBox.editingId);
      if (idx >= 0) {
        const updated = { ...list[idx], text: t, x: Math.round(textBox.x), y: Math.round(textBox.y) };
        const next = [...list];
        next[idx] = updated;
        next.splice(idx, 1);
        next.unshift(updated);

        textsRef.current = next;
        setTexts(next);
        pushHistorySnapshot(next);

        setTextBox(null);
        render(null, next);
        emitExport();
        return;
      }
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item = { id, x: Math.round(textBox.x), y: Math.round(textBox.y), text: t };

    const next = [item, ...textsRef.current];
    textsRef.current = next;
    setTexts(next);
    pushHistorySnapshot(next);

    setTextBox(null);
    render(null, next);
    emitExport();
  }

  function startOverlayDrag(e) {
    if (!textBox) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = wrapRef.current.getBoundingClientRect();
    const lx = (e.clientX ?? 0) - rect.left;
    const ly = (e.clientY ?? 0) - rect.top;

    overlayDragRef.current = { active: true, offX: lx - textBox.x, offY: ly - textBox.y };
  }

  useEffect(() => {
    if (!textBox) return;

    const move = (ev) => {
      if (!overlayDragRef.current.active) return;

      ev.preventDefault?.();
      const rect = wrapRef.current.getBoundingClientRect();
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
      const lx = cx - rect.left;
      const ly = cy - rect.top;

      setTextBox((tb) =>
        tb ? { ...tb, x: lx - overlayDragRef.current.offX, y: ly - overlayDragRef.current.offY } : tb
      );
    };

    const up = () => (overlayDragRef.current = { active: false, offX: 0, offY: 0 });

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [textBox]);

  // ============== DRAG COMMITTED TEXT ==============
  function hitTestText(p) {
    const ctx = getDisplayCtx();
    if (!ctx) return null;
    applyText(ctx);

    for (const t of textsRef.current) {
      const m = measureOneLine(t.text);
      const boxW = Math.max(BOX_MIN_W, m.w);
      const boxH = Math.max(BOX_MIN_H, m.h);

      const x0 = t.x - BOX_PAD_X;
      const y0 = t.y - BOX_PAD_Y;
      const x1 = t.x + boxW + BOX_PAD_X;
      const y1 = t.y + boxH + BOX_PAD_Y;

      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return t;
    }
    return null;
  }

  function startDraggingText(p, t) {
    dragTextRef.current = { active: true, id: t.id, offX: p.x - t.x, offY: p.y - t.y };
  }

  function moveDraggingText(p) {
    const st = dragTextRef.current;
    if (!st.active || !st.id) return;

    const list = textsRef.current;
    const idx = list.findIndex((x) => x.id === st.id);
    if (idx < 0) return;

    const cur = list[idx];
    const updated = { ...cur, x: Math.round(p.x - st.offX), y: Math.round(p.y - st.offY) };

    const next = [...list];
    next[idx] = updated;
    next.splice(idx, 1);
    next.unshift(updated);

    textsRef.current = next;
    setTexts(next);
    render(null, next);
  }

  function endDraggingText() {
    if (!dragTextRef.current.active) return;
    dragTextRef.current = { active: false, id: null, offX: 0, offY: 0 };

    pushHistorySnapshot(textsRef.current);
    render(null, textsRef.current);
    emitExport();
  }

  // ============== POINTER EVENTS ==============
  function onPointerDown(e) {
    if (textBox) return;

    const c = displayRef.current;
    if (!c) return;
    c.setPointerCapture?.(e.pointerId);

    const p = getPosFromPointerEvent(e);

    // double-tap fallback (mobile) => edit
    const now = Date.now();
    const lt = lastTapRef.current;
    const dist = Math.hypot(p.x - lt.x, p.y - lt.y);
    const isDoubleTap = now - lt.t < 320 && dist < 14;
    lastTapRef.current = { t: now, x: p.x, y: p.y };

    if (isDoubleTap) {
      const hit = hitTestText(p);
      if (hit) {
        e.preventDefault();
        openTextBoxForEdit(hit);
        return;
      }
    }

    // ✅ PRIORITÉ: si on clique sur un texte, on le déplace,
    // même si mode === "text"
    const hit = hitTestText(p);
    if (hit) {
      e.preventDefault();
      startDraggingText(p, hit);
      return;
    }

    // ✅ Sinon, si on est en mode texte, clic ailleurs => nouvelle zone
    if (mode === "text") {
      openTextBoxAt(p);
      return;
    }

    // line
    if (mode === "line") {
      lineDragRef.current = { active: true, start: p, cur: p };
      render({ start: p, end: p }, textsRef.current);
      return;
    }

    // free
    if (mode === "free") {
      const bctx = getBaseCtx();
      if (!bctx) return;
      applyStroke(bctx);
      setIsDrawing(true);
      setLast(p);
    }
  }

  function onPointerMove(e) {
    if (textBox) return;

    const p = getPosFromPointerEvent(e);

    if (dragTextRef.current.active) {
      e.preventDefault();
      moveDraggingText(p);
      return;
    }

    if (mode === "line") {
      const st = lineDragRef.current;
      if (!st.active || !st.start) return;
      e.preventDefault();

      const snapped = snapLineEnd(st.start, p);
      st.cur = snapped;

      render({ start: st.start, end: snapped }, textsRef.current);
      return;
    }

    if (mode === "free" && isDrawing) {
      e.preventDefault();
      const bctx = getBaseCtx();
      if (!bctx) return;
      applyStroke(bctx);

      bctx.beginPath();
      bctx.moveTo(last.x, last.y);
      bctx.lineTo(p.x, p.y);
      bctx.stroke();

      setLast(p);
      render(null, textsRef.current);
    }
  }

  function onPointerUp() {
    if (textBox) return;

    if (dragTextRef.current.active) {
      endDraggingText();
      return;
    }

    if (mode === "line") {
      const st = lineDragRef.current;
      if (!st.active || !st.start) return;

      const end = st.cur ?? st.start;
      st.active = false;

      const bctx = getBaseCtx();
      if (!bctx) return;
      applyStroke(bctx);

      bctx.beginPath();
      bctx.moveTo(st.start.x, st.start.y);
      bctx.lineTo(end.x, end.y);
      bctx.stroke();

      lineDragRef.current = { active: false, start: null, cur: null };
      pushHistorySnapshot(textsRef.current);
      render(null, textsRef.current);
      emitExport();
      return;
    }

    if (mode === "free" && isDrawing) {
      setIsDrawing(false);
      pushHistorySnapshot(textsRef.current);
      render(null, textsRef.current);
      emitExport();
    }
  }

  function onDoubleClick(e) {
    const p = getPosFromPointerEvent(e);
    const hit = hitTestText(p);
    if (hit) {
      e.preventDefault();
      openTextBoxForEdit(hit);
    }
  }

  const overlayDims = useMemo(() => {
    if (!textBox) return { w: 120, h: 34 };
    const m = measureOneLine(textBox.text);
    const w = Math.max(BOX_MIN_W, m.w) + BOX_PAD_X * 2;
    const h = Math.max(BOX_MIN_H, m.h) + BOX_PAD_Y * 2;
    return { w, h };
  }, [textBox?.text]);

  const overlayStyle = useMemo(() => {
    if (!textBox) return null;
    return { x: textBox.x, y: textBox.y, boxW: overlayDims.w, boxH: overlayDims.h };
  }, [textBox, overlayDims.w, overlayDims.h]);

  function stopProp(e) {
    e.stopPropagation?.();
  }

  function stopBoth(e) {
    e.preventDefault?.();
    e.stopPropagation?.();
  }

  useEffect(() => {
    render(null, texts);
    // eslint-disable-next-line
  }, [texts]);

  return (
    <div ref={wrapRef} style={{ width, height, position: "relative" }}>
      <canvas
        ref={displayRef}
        width={width}
        height={height}
        style={{
          width: "100%",
          height: "100%",
          background: "#fff",
          border: "1px solid #cfcfcf",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
      />

      {textBox && overlayStyle && (
        <div
          style={{
            position: "absolute",
            left: overlayStyle.x,
            top: overlayStyle.y,
            display: "flex",
            alignItems: "center",
            gap: CHECK_GAP,
            zIndex: 20,
          }}
          onPointerDown={stopProp}
          onPointerMove={stopProp}
          onPointerUp={stopProp}
        >
          <div
            style={{
              width: overlayStyle.boxW,
              height: overlayStyle.boxH,
              border: "1px solid #111",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              padding: `0 ${BOX_PAD_X}px`,
              boxSizing: "border-box",
              cursor: "move",
            }}
            onMouseDown={startOverlayDrag}
            onPointerDown={stopProp}
          >
            <input
              ref={inputRef}
              value={textBox.text}
              onPointerDown={stopProp}
              onPointerMove={stopProp}
              onPointerUp={stopProp}
              onMouseDown={stopProp}
              onChange={(e) => setTextBox((tb) => (tb ? { ...tb, text: e.target.value } : tb))}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                fontSize: TEXT_PX,
                fontWeight: 700,
                lineHeight: 1,
                color: "#111",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTextBox();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeTextBox();
                }
              }}
            />
          </div>

          <button
            type="button"
            onPointerDown={stopBoth}
            onPointerUp={stopBoth}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              commitTextBox();
            }}
            style={{
              width: CHECK_SIZE,
              height: CHECK_SIZE,
              borderRadius: 999,
              border: "1px solid #111",
              background: "#fff",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              padding: 0,
            }}
            title="Confirmer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M20 6L9 17l-5-5"
                fill="none"
                stroke="#111"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
