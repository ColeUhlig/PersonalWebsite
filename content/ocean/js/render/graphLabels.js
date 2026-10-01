// The flat graph's axes and words (piece C2; lane B owns this file; spec 10.4): line segments for the
// two axes and their ticks, and text as camera-facing sprites drawn into small canvases, each redrawn
// only when its text changes, sized in pixels whatever the camera's distance. The numbers on them are
// live (the ticks of the span in view, the sine's own height and length), never copy. Segments are
// written by index into a buffer made once (pre-flight R18).
import * as THREE from 'three';

export { axisTicks, niceStep } from '../page/graphModel.js';

const INK = '#e8eef2'; // style.css --ink
const DIM = '#a9bcc8'; // --ink-dim
const HALO = '#0b1a24'; // --body-bg, the backdrop's colour: words stay legible where a curve crosses them
const HALO_PX = 3;
// Task 15: each word also sits on a plate of the backdrop's colour (its padding box, rounded), drawn
// over the curve, so a curve that runs through a word or number (a phone's height numbers, the
// "A = ..." word beside a crest's flank) shows only faintly behind it. On the backdrop itself the
// plate doesn't show.
const PLATE_ALPHA = 0.85;
const PLATE_RADIUS_PX = 4;
const FONT_PX = 13;
const SCALE = 2; // canvas pixels per CSS pixel, for crisp text
const AXIS_OPACITY = 0.8;
export const MAX_SEGMENTS = 96;
// Pixels of padding drawn around a label's text (left and right, top and bottom).
export const PAD_X = 4;
export const PAD_Y = 3;
const SCRATCH = new THREE.Vector3();

export function createAxes({ order = 11 } = {}) {
	const positions = new Float32Array(MAX_SEGMENTS * 2 * 3);
	const attribute = new THREE.BufferAttribute(positions, 3);
	attribute.setUsage(THREE.DynamicDrawUsage);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', attribute);
	geometry.setDrawRange(0, 0);
	const material = new THREE.LineBasicMaterial({ color: new THREE.Color().setStyle(DIM, THREE.SRGBColorSpace), transparent: true, opacity: AXIS_OPACITY, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
	const lines = new THREE.LineSegments(geometry, material);
	lines.renderOrder = order;
	lines.frustumCulled = false;
	let count = 0;
	return {
		lines,
		begin() {
			count = 0;
		},
		segment(x0, y0, z0, x1, y1, z1) {
			if (count >= MAX_SEGMENTS) return;
			const o = count * 6;
			positions[o] = x0;
			positions[o + 1] = y0;
			positions[o + 2] = z0;
			positions[o + 3] = x1;
			positions[o + 4] = y1;
			positions[o + 5] = z1;
			count += 1;
		},
		end(opacity) {
			geometry.setDrawRange(0, count * 2);
			attribute.needsUpdate = true;
			material.opacity = AXIS_OPACITY * opacity;
			lines.visible = count > 0 && opacity > 0;
		},
	};
}

export function createLabel({ colour = INK, order = 14 } = {}) {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
	const sprite = new THREE.Sprite(material);
	sprite.renderOrder = order;
	sprite.frustumCulled = false;
	sprite.visible = false;
	let text = null;
	let widthPx = 1;
	const heightPx = FONT_PX + 2 * PAD_Y;
	return {
		sprite,
		text: () => text,
		// The label's width in CSS pixels, padding included (Task 14: the stage keeps it clear of the
		// page's pills).
		width: () => widthPx,
		// Redraws only for new text.
		set(next) {
			if (next === text) return;
			text = next;
			context.font = `${FONT_PX * SCALE}px system-ui, sans-serif`;
			widthPx = Math.ceil(context.measureText(next).width / SCALE) + 2 * PAD_X;
			if (canvas.width !== widthPx * SCALE) {
				// A new size: drop the GPU copy so it is made again at this size (WebGL2 texture
				// storage cannot be resized in place). Setting the width also clears the canvas.
				texture.dispose();
				canvas.width = widthPx * SCALE;
				canvas.height = heightPx * SCALE;
			} else {
				context.clearRect(0, 0, canvas.width, canvas.height);
			}
			context.globalAlpha = PLATE_ALPHA;
			context.fillStyle = HALO;
			context.beginPath();
			context.roundRect(0, 0, canvas.width, canvas.height, PLATE_RADIUS_PX * SCALE);
			context.fill();
			context.globalAlpha = 1;
			context.font = `${FONT_PX * SCALE}px system-ui, sans-serif`;
			context.textBaseline = 'middle';
			context.lineJoin = 'round';
			context.lineWidth = HALO_PX * SCALE;
			context.strokeStyle = HALO;
			context.strokeText(next, PAD_X * SCALE, (heightPx / 2) * SCALE);
			context.fillStyle = colour;
			context.fillText(next, PAD_X * SCALE, (heightPx / 2) * SCALE);
			texture.needsUpdate = true;
		},
		// `anchor` is 'left', 'centre' or 'right' of the point.
		place(x, y, z, studsPerPixel, opacity, anchor = 'centre') {
			sprite.visible = opacity > 0 && text !== null;
			sprite.scale.set(widthPx * studsPerPixel, heightPx * studsPerPixel, 1);
			sprite.center.set(anchor === 'left' ? 0 : anchor === 'right' ? 1 : 0.5, 0.5);
			sprite.position.set(x, y, z);
			material.opacity = opacity;
		},
		hide() {
			sprite.visible = false;
		},
		// The text's box on screen in CSS pixels (padding left out), or null while hidden; for the
		// probe, not the frame.
		rect(camera, viewWidth, viewHeight) {
			if (!sprite.visible || text === null) return null;
			SCRATCH.copy(sprite.position).project(camera);
			const x = ((SCRATCH.x + 1) / 2) * viewWidth - sprite.center.x * widthPx;
			const y = ((1 - SCRATCH.y) / 2) * viewHeight - heightPx / 2;
			return { text, x0: x + PAD_X, y0: y + PAD_Y, x1: x + widthPx - PAD_X, y1: y + heightPx - PAD_Y };
		},
	};
}
