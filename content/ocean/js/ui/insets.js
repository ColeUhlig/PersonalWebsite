// The texture insets of steps 22, 23 and 25 (piece C2; lane F owns this file; spec 10.7), drawn into
// 2D canvases from what the engine really holds:
//   fields (step 22): the 256-stud layer's height, slope along x and sideways push along x, straight
//     from the field store's display (the fields the surface is sampled from this frame), each with
//     its live range, and a line giving the grid's size and spacing as the engine has them;
//   sampling (step 23): a zoom on one point among its grid neighbours, the four it blends outlined
//     with their weights, the tile's edge dashed where the window wraps across it, and the blended
//     height beside the engine's own sampler's (page/fieldViews.js bilinear and Cascade.sampleHeight);
//   painted (step 25): the painters' colour, glow-mask and ripple maps as the materials hold them
//     (the bytes Roblox is handed: the colour map sRGB, the normal map raw, R from n.x, G from n.z,
//     B from n.y as core/normalTexels.js packs it), shrunk to one size, each labelled with its
//     texture's own size.
// Each redraws only while on screen, at most four times a second, and rewrites its numbers every
// second drawing (twice a second) so they can be read. Every number shown is computed in the visitor's
// browser, inside the figure's .inset-body (data-copy-skip="live"); the words beside
// them carry no digits.
import * as Cascade from '../core/cascade.js';
import { mod } from '../core/luau.js';
import { NORMAL_BLOCK_TEXELS, NORMAL_IMAGE_TEXELS } from '../engine/config.js';
import { FIELD_VIEWS, ZOOM, downsample, fieldToRgba, magnitude, walkPoint, zoomLayout } from '../page/fieldViews.js';

const REDRAW_MS = 250;
const SAMPLING_PX = 240;
const AMBER = '#f2b25c'; // style.css --term-a
const INK = '#e8eef2'; // --ink
const BACKING = 'rgba(8, 18, 28, 0.78)';
const PAINTED_TEXELS = 128;
// The texel whose colour the fields hook reports, so a test can tie a pixel to its field.
const PROBE_TEXEL = Object.freeze([20, 10]);
const PAINTED = Object.freeze([
	Object.freeze({ name: 'colour', label: 'Colour' }),
	Object.freeze({ name: 'mask', label: 'Glow mask' }),
	Object.freeze({ name: 'normal', label: 'Ripples (the normal map)' }),
]);

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

const studs = (value) => `${value.toFixed(2)} studs`;
const trim = (value) => String(Number(value.toFixed(2)));

// Runs `draw` every `ms` while `figure` is on screen.
function whileVisible(figure, ms, draw) {
	let timer = 0;
	new IntersectionObserver((entries) => {
		const visible = entries.some((entry) => entry.isIntersecting);
		if (visible && timer === 0) {
			draw();
			timer = setInterval(draw, ms);
		} else if (!visible && timer !== 0) {
			clearInterval(timer);
			timer = 0;
		}
	}).observe(figure);
}

function fieldsInset(figure, ocean, onLayout) {
	const body = figure.querySelector('.inset-body');
	let n = ocean.store.display[0].n;
	let image = new ImageData(n, n);
	const cells = FIELD_VIEWS.map((view) => {
		const canvas = element('canvas', { width: n, height: n });
		canvas.setAttribute('aria-hidden', 'true');
		const range = element('span', { className: 'inset-range' });
		const cell = element('div', { className: 'inset-field' }, [canvas, element('p', { className: 'inset-label', textContent: view.label }), range]);
		cell.dataset.field = view.name;
		return { view, canvas, context: canvas.getContext('2d'), range, cell };
	});
	const line = element('p', { className: 'inset-line' });
	body.replaceChildren(...cells.map((c) => c.cell), line);
	onLayout();
	let state = null;
	let draws = 0;
	function resize(size) {
		n = size;
		image = new ImageData(n, n);
		for (const cell of cells) {
			cell.canvas.width = n;
			cell.canvas.height = n;
		}
	}
	function draw() {
		const fields = ocean.store.display[0];
		if (fields.n !== n) resize(fields.n);
		// The surface moves sideways by chop x dispX (core/surfaceSampler.js), so the push shown is that.
		const chop = ocean.live.chop;
		const writeNumbers = draws % 2 === 0;
		const probe = (PROBE_TEXEL[1] % n) * n + (PROBE_TEXEL[0] % n);
		const next = { n, size: fields.size, chop, probe: { column: PROBE_TEXEL[0] % n, row: PROBE_TEXEL[1] % n }, push: state?.push ?? null };
		for (const cell of cells) {
			const values = fields[cell.view.name];
			const { min, max } = fieldToRgba(values, image.data);
			cell.context.putImageData(image, 0, 0);
			const shown = cell.view.name === 'dispX' ? [min * chop, max * chop] : [min, max];
			if (writeNumbers) {
				cell.range.textContent = `${shown[0].toFixed(2)} to ${shown[1].toFixed(2)}`;
				// What the push cell says, with what it was made from, so the shown number is what's tested.
				if (cell.view.name === 'dispX') next.push = { min: shown[0], max: shown[1], field: [min, max], chop };
			}
			next[cell.view.name] = { min, max, value: values[probe] };
		}
		if (writeNumbers) {
			line.textContent = `Each image is the engine's ${n} × ${n} grid, one number every ${trim(fields.size / n)} studs across ${trim(fields.size)} studs, blue below zero and amber above. Height and push are in studs; slope has no unit. The push along x is the sideways field times the choppiness, ${chop.toFixed(2)} here.`;
		}
		draws += 1;
		state = { ...next, draws };
	}
	whileVisible(figure, REDRAW_MS, draw);
	return { state: () => state };
}

// A small label on a dark backing, its box anchored at (x, y) and grown right or left, down or up.
function tag(context, scale, text, x, y, colour, right = false, up = false) {
	const pad = 3 * scale;
	const width = context.measureText(text).width + 2 * pad;
	const height = 15 * scale;
	const left = right ? x - width : x;
	const top = up ? y - height : y;
	context.fillStyle = BACKING;
	context.fillRect(left, top, width, height);
	context.fillStyle = colour;
	context.fillText(text, left + pad, top + 2 * scale);
}

// The window's texels, each column's index along the bottom row (wrapped, so ... n - 1, 0, 1 ...),
// and the tile's edge dashed where the columns wrap back to column 0.
function drawGrid(context, side, scale, n, zoom, colours) {
	const cell = side / ZOOM;
	context.clearRect(0, 0, side, side);
	for (let j = 0; j < ZOOM; j++) {
		for (let i = 0; i < ZOOM; i++) {
			const o = (j * ZOOM + i) * 4;
			context.fillStyle = `rgb(${colours[o]}, ${colours[o + 1]}, ${colours[o + 2]})`;
			context.fillRect(i * cell, j * cell, cell - 1, cell - 1);
		}
	}
	context.font = `600 ${10 * scale}px system-ui, sans-serif`;
	context.textBaseline = 'top';
	for (let i = 0; i < ZOOM; i++) tag(context, scale, String(mod(zoom.first[0] + i, n)), i * cell + 2 * scale, side - 3 * scale, INK, false, true);
	// The seam: sample k sits at u = k, so x at the tile's size (0 again) is sample 0 itself, drawn at
	// its cell's centre (fieldViews.js zoomLayout).
	const edge = zoom.edge;
	if (edge !== null) {
		context.setLineDash([6 * scale, 4 * scale]);
		context.strokeStyle = BACKING;
		context.lineWidth = 3 * scale;
		context.beginPath();
		context.moveTo(edge * cell, 0);
		context.lineTo(edge * cell, side);
		context.stroke();
		context.setLineDash([]);
		tag(context, scale, 'tile edge', edge * cell + 3 * scale, 3 * scale, INK);
	}
}

// The four texels the point blends, each weight in its texel's outer corner (away from the point,
// which always sits inside the square joining their centres), the lines to their centres, and the point.
function drawBlend(context, side, scale, n, zoom) {
	const cell = side / ZOOM;
	const blend = zoom.blend;
	const local = (index) => [mod((index % n) - zoom.first[0], n), mod(Math.floor(index / n) - zoom.first[1], n)];
	const px = zoom.point[0] * cell;
	const py = zoom.point[1] * cell;
	const pad = 3 * scale;
	context.lineWidth = 2 * scale;
	context.font = `600 ${11 * scale}px system-ui, sans-serif`;
	context.textBaseline = 'top';
	blend.indices.forEach((index, k) => {
		const [ci, cj] = local(index);
		const right = (k & 1) === 1;
		const down = k >= 2;
		context.strokeStyle = AMBER;
		context.strokeRect(ci * cell + 1, cj * cell + 1, cell - 3, cell - 3);
		context.beginPath();
		context.moveTo(px, py);
		context.lineTo((ci + 0.5) * cell, (cj + 0.5) * cell);
		context.stroke();
		const x = right ? (ci + 1) * cell - pad : ci * cell + pad;
		const y = down ? (cj + 1) * cell - pad : cj * cell + pad;
		tag(context, scale, blend.weights[k].toFixed(2), x, y, AMBER, right, down);
	});
	context.beginPath();
	context.arc(px, py, 5 * scale, 0, Math.PI * 2);
	context.fillStyle = INK;
	context.fill();
	context.strokeStyle = BACKING;
	context.stroke();
}

function samplingInset(figure, ocean, onLayout) {
	const body = figure.querySelector('.inset-body');
	const scale = Math.min(window.devicePixelRatio || 1, 2);
	const side = SAMPLING_PX * scale;
	const canvas = element('canvas', { width: side, height: side });
	canvas.setAttribute('aria-hidden', 'true');
	const line = element('p', { className: 'inset-line' });
	body.replaceChildren(canvas, line);
	onLayout();
	const context = canvas.getContext('2d');
	const heights = new Float64Array(ZOOM * ZOOM);
	const colours = new Uint8ClampedArray(ZOOM * ZOOM * 4);
	const engineOut = new Float64Array(3);
	const point = [0, 0];
	let state = null;
	let draws = 0;
	function draw() {
		const fields = ocean.store.display[0];
		walkPoint(ocean.teachT, fields.size, point);
		const zoom = zoomLayout(fields, point[0], point[1], heights);
		const blend = zoom.blend;
		// The whole field's colour scale, so a texel keeps the shade it has in step 22's image.
		fieldToRgba(heights, colours, magnitude(fields.height));
		drawGrid(context, side, scale, fields.n, zoom, colours);
		drawBlend(context, side, scale, fields.n, zoom);
		const engine = Cascade.sampleHeight(fields, point[0], point[1], engineOut)[0];
		if (draws % 2 === 0) {
			line.textContent = `At x ${point[0].toFixed(2)}, column ${blend.column} blends with column ${blend.column1}. The ${trim(fields.size)}-stud layer's height there is ${studs(blend.value)}; the engine's own sampler says ${studs(engine)}.`;
		}
		draws += 1;
		state = {
			x: point[0], z: point[1], value: blend.value, engine, weights: blend.weights, wraps: zoom.wraps,
			column: blend.column, column1: blend.column1, point: zoom.point[0], edge: zoom.edge, draws,
		};
	}
	whileVisible(figure, REDRAW_MS, draw);
	return { state: () => state };
}

// One painted map's cell: shrunk into `image` and drawn when its texture has taken a new upload
// since the last drawing; its size line follows the texture's own size.
function drawPaintedCell(cell, texture, image) {
	const { width, height } = texture.image;
	if (cell.width !== width || cell.height !== height) {
		cell.width = width;
		cell.height = height;
		cell.range.textContent = `${width} × ${height} texels`;
	}
	if (texture.version === cell.version) return;
	const data = texture.image.data;
	if (width === PAINTED_TEXELS) {
		image.data.set(data);
	} else {
		downsample(data, width, image.data, PAINTED_TEXELS);
	}
	cell.context.putImageData(image, 0, 0);
	cell.version = texture.version;
	const seen = new Set();
	for (let i = 0; i < image.data.length; i += 4 * 7) seen.add((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]);
	cell.colours = seen.size;
}

// The painters' maps as the materials hold them, each shrunk to PAINTED_TEXELS and redrawn only when
// its texture has taken a new upload since the last drawing.
function paintedInset(figure, materials, config, onLayout) {
	const body = figure.querySelector('.inset-body');
	const image = new ImageData(PAINTED_TEXELS, PAINTED_TEXELS);
	const cells = PAINTED.map((map) => {
		const canvas = element('canvas', { width: PAINTED_TEXELS, height: PAINTED_TEXELS });
		canvas.setAttribute('aria-hidden', 'true');
		const range = element('span', { className: 'inset-range' });
		const cell = element('div', { className: 'inset-field' }, [canvas, element('p', { className: 'inset-label', textContent: map.label }), range]);
		cell.dataset.map = map.name;
		return { map, canvas, context: canvas.getContext('2d'), range, cell, version: -1, colours: 0, width: 0, height: 0 };
	});
	// The normal image is one painted block the materials' sink tiles across it, except under
	// ?calibrate=map (render/materials.js uploadMaskOrNormal, NormalTexels.tile).
	const block = config?.calibrate === 'map' ? NORMAL_IMAGE_TEXELS : NORMAL_BLOCK_TEXELS;
	const tiled = block < NORMAL_IMAGE_TEXELS ? ` The painter paints one ${block} × ${block} ripple block, and the materials repeat it across the ripple map.` : '';
	const line = element('p', { className: 'inset-line', textContent: `Each map is drawn at ${PAINTED_TEXELS} × ${PAINTED_TEXELS} here; the sizes under them are the textures' own.${tiled}` });
	body.replaceChildren(...cells.map((c) => c.cell), line);
	onLayout();
	let draws = 0;
	function draw() {
		for (const cell of cells) drawPaintedCell(cell, materials.textures[cell.map.name], image);
		draws += 1;
	}
	whileVisible(figure, REDRAW_MS, draw);
	const each = (read) => Object.fromEntries(cells.map((c) => [c.map.name, read(c)]));
	return {
		state: () => (draws > 0 ? {
			versions: each((c) => c.version),
			colours: each((c) => c.colours),
			sizes: each((c) => [c.width, c.height]),
			shown: PAINTED_TEXELS,
			draws,
		} : null),
	};
}

// One inset, started on its own: one that throws is logged and the others still start.
function safely(name, start) {
	try {
		return start();
	} catch (error) {
		console.error(`[ocean] the ${name} inset could not start`, error);
		return null;
	}
}

// `watchReading` is part of the contract and unused here: each inset follows its own visibility.
export function mountInsets({ handle, watchReading, onLayout = () => {} }) {
	const ocean = handle.ocean;
	const insets = {};
	const fields = document.querySelector('figure.inset[data-inset="fields"]');
	const sampling = document.querySelector('figure.inset[data-inset="sampling"]');
	if (fields) insets.fields = safely('fields', () => fieldsInset(fields, ocean, onLayout));
	if (sampling) insets.sampling = safely('sampling', () => samplingInset(sampling, ocean, onLayout));
	const painted = document.querySelector('figure.inset[data-inset="painted"]');
	if (painted && handle.materials?.textures) insets.painted = safely('painted', () => paintedInset(painted, handle.materials, handle.config, onLayout));
	return Object.freeze({
		hooks: Object.freeze({
			drawn: () => Object.keys(insets).filter((name) => insets[name]?.state() != null),
			fields: () => insets.fields?.state() ?? null,
			sampling: () => insets.sampling?.state() ?? null,
			painted: () => insets.painted?.state() ?? null,
		}),
	});
}
