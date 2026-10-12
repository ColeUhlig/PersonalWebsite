import { svg, wrap } from "./svg.js";

const PAD = 12;
const HEAD_H = 34;
const LINE_H = 15;

function layout(width, height, scene) {
  const n = scene.lanes.length;
  const headW = Math.min(118, (width - 2 * PAD) / n - 6);
  const span = width - 2 * PAD - headW;
  const laneX = Object.fromEntries(scene.lanes.map((lane, i) => [lane.id, PAD + headW / 2 + (span * i) / (n - 1)]));
  const top = HEAD_H + 18;
  const rowH = Math.max(36, Math.min(60, (height - top - 10) / scene.rows.length));
  return { width, headW, laneX, top, rowH, gap: span / (n - 1) };
}

function textBlock(lines, x, yLast, cls) {
  const text = svg("text", { x, y: yLast - (lines.length - 1) * LINE_H, class: cls, "text-anchor": "middle" });
  lines.forEach((line, i) => text.append(svg("tspan", { x, dy: i === 0 ? 0 : LINE_H }, line)));
  return text;
}

function clampCenter(center, halfWidth, width) {
  return Math.max(PAD + halfWidth, Math.min(width - PAD - halfWidth, center));
}

function arrowHead(x, y, dir) {
  return svg("path", { class: "head", d: `M${x},${y} l${-8 * dir},-4.5 v9 z` });
}

function drawMessage(row, y, geo) {
  const x1 = geo.laneX[row.from];
  const x2 = geo.laneX[row.to];
  const dir = Math.sign(x2 - x1);
  const failed = row.kind === "fail";
  const end = failed ? x1 + (x2 - x1) * 0.62 : x2 - dir * 3;
  const dashed = failed || row.kind === "reply";
  const g = svg("g");
  // pathLength lets CSS draw solid wires in; dashed wires keep real units so their dashes stay visible.
  g.append(svg("path", { class: "wire", d: `M${x1 + dir * 3},${y} H${end}`, pathLength: dashed ? null : 1 }));
  if (failed) {
    g.append(svg("path", { class: "cross", d: `M${end - 6},${y - 6} l12,12 m0,-12 l-12,12` }));
  } else {
    g.append(arrowHead(end, y, dir));
  }
  const labelW = Math.max(Math.abs(x2 - x1) - 12, 150);
  const lines = wrap(row.label, labelW);
  const cx = clampCenter((x1 + x2) / 2, labelW / 2, geo.width);
  g.append(textBlock(lines, cx, y - 7, "label"));
  return g;
}

function drawNote(row, y, geo) {
  const maxW = Math.min(geo.gap * 1.7, 230);
  const lines = wrap(row.label, maxW - 16, { maxLines: 3 });
  const longest = Math.max(...lines.map((l) => l.length));
  const w = Math.min(maxW, longest * 6.9 + 18);
  const h = lines.length * LINE_H + 10;
  const cx = clampCenter(geo.laneX[row.at], w / 2, geo.width);
  const g = svg("g");
  g.append(svg("rect", { class: "note-box", x: cx - w / 2, y: y - h / 2, width: w, height: h, rx: 4 }));
  g.append(textBlock(lines, cx, y + h / 2 - 9, "label note-label"));
  return g;
}

function drawFrame(scene, geo, height) {
  const frame = svg("g", { class: "frame" });
  for (const lane of scene.lanes) {
    const x = geo.laneX[lane.id];
    frame.append(svg("line", { class: "lifeline", x1: x, x2: x, y1: HEAD_H, y2: height - 4 }));
    frame.append(svg("rect", { class: "lane-head", x: x - geo.headW / 2, y: 2, width: geo.headW, height: HEAD_H - 4, rx: 4 }));
    const size = geo.headW < 84 ? 11 : 12.5;
    frame.append(svg("text", { class: "lane-label", x, y: HEAD_H / 2 + 4, "font-size": size, "text-anchor": "middle" }, lane.label));
  }
  return frame;
}

/** Render a scene into `host` and reveal its rows step by step. */
export function createSequence(host, scene) {
  let step = 0;
  let rows = [];

  function applyStep(previous) {
    for (const { node, row } of rows) {
      const state = row.step < step ? "past" : row.step === step ? "now" : "future";
      node.setAttribute("class", `row kind-${row.kind || "msg"} is-${state}`);
      if (state === "now" && row.step > previous) node.classList.add("enter");
    }
  }

  function draw() {
    const { width, height } = host.getBoundingClientRect();
    if (width < 50 || height < 50) return;
    const geo = layout(width, height, scene);
    const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": scene.title });
    root.append(drawFrame(scene, geo, height));
    rows = scene.rows.map((row, i) => {
      const y = geo.top + i * geo.rowH + geo.rowH * 0.62;
      const node = row.kind === "note" ? drawNote(row, y, geo) : drawMessage(row, y, geo);
      root.append(node);
      return { node, row };
    });
    host.replaceChildren(root);
    applyStep(step);
  }

  new ResizeObserver(draw).observe(host);
  draw();

  return {
    setStep(next) {
      if (next === step) return;
      const previous = step;
      step = next;
      applyStep(previous);
    },
  };
}
