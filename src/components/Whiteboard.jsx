import { useEffect, useRef, useState } from "react";

// Fixed internal drawing resolution. Both peers draw onto a canvas of this
// exact size regardless of their own window size (the canvas is then scaled
// visually with CSS) — that way a stroke's raw {x,y} coordinates mean the
// same thing on both screens and can be sent over the wire as-is, with no
// need to normalize by each peer's differing viewport.
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const COLORS = [
  { value: "#0f172a", label: "Ink" },
  { value: "#2563eb", label: "Blue" },
  { value: "#dc2626", label: "Red" },
  { value: "#16a34a", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
];

const WIDTHS = [
  { value: 3, label: "S" },
  { value: 6, label: "M" },
  { value: 10, label: "L" },
];

function drawSegment(ctx, from, to, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function toCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

// Shared drawing surface for the call. Strokes are broadcast over the same
// signaling WebSocket used for WebRTC negotiation (see useSignalingSocket) —
// the backend just relays them, same as an ICE candidate; it never sees or
// stores the drawing itself.
export default function Whiteboard({ send, subscribe, t }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [color, setColor] = useState(COLORS[1].value);
  const [width, setWidth] = useState(WIDTHS[1].value);

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (message.type === "whiteboard-draw") {
        drawSegment(
          ctx,
          { x: message.x0, y: message.y0 },
          { x: message.x1, y: message.y1 },
          message.color,
          message.width
        );
      } else if (message.type === "whiteboard-clear") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });
    return unsubscribe;
  }, [subscribe]);

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = toCanvasPoint(event, canvas);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const point = toCanvasPoint(event, canvas);
    const from = lastPointRef.current;
    drawSegment(canvas.getContext("2d"), from, point, color, width);
    send({ type: "whiteboard-draw", x0: from.x, y0: from.y, x1: point.x, y1: point.y, color, width });
    lastPointRef.current = point;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    send({ type: "whiteboard-clear" });
  };

  return (
    <div className="whiteboard">
      <div className="whiteboard-toolbar">
        <div className="whiteboard-colors" role="group" aria-label={t("call.whiteboardColor")}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              className="whiteboard-swatch"
              style={{ background: c.value }}
              aria-pressed={color === c.value}
              aria-label={c.label}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>
        <div className="segmented whiteboard-widths" role="group" aria-label={t("call.whiteboardWidth")}>
          {WIDTHS.map((w) => (
            <button key={w.value} aria-pressed={width === w.value} onClick={() => setWidth(w.value)}>
              {w.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost whiteboard-clear" onClick={handleClear}>
          {t("call.whiteboardClear")}
        </button>
      </div>
      <div className="whiteboard-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="whiteboard-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  );
}
