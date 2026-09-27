import * as THREE from 'three';

// A 2D canvas drawn over the 3D view. Field-frame points are projected through the active camera,
// so everything lines up with the field once the camera is overhead. Chapters call `draw` with a
// list of primitives every frame; the overlay owns no state of its own.

const COLORS = Object.freeze({
  truth: 'rgba(255,255,255,0.55)',
  estimate: '#3be3ff',
  target: '#ffb347',
  error: '#ff5c6c',
  construct: '#ff4fd8',
  muted: '#8b98b3',
});

export function createOverlay(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize(w, h, ratio) {
    width = w; height = h; dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  /** Field [x, y] → canvas pixel [px, py] for the given camera. */
  function project(camera, [x, y]) {
    const v = new THREE.Vector3(x, 0, -y).project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }

  /** Pixels per inch at the field plane (top-down only). */
  function scale(camera) {
    const a = project(camera, [0, 0]);
    const b = project(camera, [10, 0]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
  }

  const color = (name) => COLORS[name] ?? name;

  const painters = {
    polyline(cam, p) {
      if (p.points.length < 2) return;
      ctx.beginPath();
      p.points.forEach((pt, i) => { const [px, py] = project(cam, pt); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 2; ctx.setLineDash(p.dash ?? []);
      if (p.close) ctx.closePath();
      ctx.stroke();
      if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
    },
    polygon(cam, p) { painters.polyline(cam, { ...p, close: true, fill: p.fill }); },
    circle(cam, p) {
      const [px, py] = project(cam, p.center);
      ctx.beginPath(); ctx.arc(px, py, p.radius * scale(cam), 0, Math.PI * 2);
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 1.5; ctx.setLineDash(p.dash ?? []); ctx.stroke();
      if (p.fill) { ctx.fillStyle = color(p.fill); ctx.fill(); }
    },
    dot(cam, p) {
      const [px, py] = project(cam, p.at);
      ctx.beginPath(); ctx.arc(px, py, p.radius ?? 4, 0, Math.PI * 2);
      ctx.fillStyle = color(p.color); ctx.fill();
    },
    // Arc of a circle between two compass angles (clockwise from `from` to `to`).
    arc(cam, p) {
      const [px, py] = project(cam, p.center);
      const r = p.radius * scale(cam);
      // compass angle a → canvas angle: canvas 0 is +x, clockwise positive (y down). compass 0 is up.
      const toCanvas = (a) => a - Math.PI / 2;
      ctx.beginPath(); ctx.arc(px, py, r, toCanvas(p.from), toCanvas(p.to), p.to < p.from);
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 2; ctx.setLineDash(p.dash ?? []); ctx.stroke();
    },
    ray(cam, p) {
      const [ax, ay] = project(cam, p.from);
      const [bx, by] = project(cam, p.to);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 2; ctx.setLineDash(p.dash ?? []); ctx.stroke();
      if (p.arrow) {
        const ang = Math.atan2(by - ay, bx - ax);
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.lineTo(bx - 10 * Math.cos(ang - 0.4), by - 10 * Math.sin(ang - 0.4));
        ctx.lineTo(bx - 10 * Math.cos(ang + 0.4), by - 10 * Math.sin(ang + 0.4));
        ctx.closePath(); ctx.fillStyle = color(p.color); ctx.fill();
      }
    },
    // Dimension line with perpendicular end ticks and a label (in the middle, or at the end).
    dimension(cam, p) {
      painters.ray(cam, { from: p.from, to: p.to, color: p.color ?? 'muted', width: 1 });
      const [ax, ay] = project(cam, p.from); const [bx, by] = project(cam, p.to);
      const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        ctx.beginPath(); ctx.moveTo(x - 5 * Math.cos(ang), y - 5 * Math.sin(ang)); ctx.lineTo(x + 5 * Math.cos(ang), y + 5 * Math.sin(ang)); ctx.stroke();
      }
      const at = p.labelAt === 'end' ? p.to : [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2];
      painters.label(cam, { at, text: p.text, color: p.color ?? 'muted', offset: p.offset ?? [0, -10] });
    },
    label(cam, p) {
      const [px, py] = project(cam, p.at);
      const [ox, oy] = p.offset ?? [8, -8];
      ctx.font = `${p.size ?? 13}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = color(p.color); ctx.textAlign = p.align ?? 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(p.text, px + ox, py + oy);
    },
  };

  function draw(camera, primitives, alpha = 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = alpha;
    for (const p of primitives) {
      const paint = painters[p.type];
      if (!paint) throw new Error(`Unknown overlay primitive: ${p.type}`);
      paint(camera, p);
    }
    ctx.globalAlpha = 1;
  }

  function clear() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); }

  return { resize, draw, clear, project, scale };
}
