// The scroll story driving the ocean (piece C Task 5): A3's director, the stage look and the camera
// shots follow the scroll; the visitor orbits between shots within limits; the wheel over the ocean
// scrolls the page; a jump into an FFT step never shows flat water; reduced motion gets cuts.
// Shot numbers come from the recipes themselves, never copies, so A3's later shot changes hold.
// Steps are named by id (piece C2, Task 0); a test about neighbours uses real neighbours.
import { test, expect } from '@playwright/test';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { movingReach, polarRange, STORY_MAX_DISTANCE } from '../../../content/ocean/js/page/orbitLimits.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import { oceanRunning, scrollToId, scrollToOpening, waitFrames, watchErrors } from './helpers/story.js';
import { story } from './helpers/stage.js';

const at = (id) => recipeFor(stepOf(id));

const camera = (page) => page.evaluate(() => window.__ocean.camera.position.toArray());
const sub = (a, b) => a.map((v, i) => v - b[i]);
const length = (v) => Math.hypot(...v);
// Radians from straight down, as OrbitControls measures the tilt.
const polarOf = (pose) => {
	const [dx, dy, dz] = sub(pose.position, pose.target);
	return Math.atan2(Math.hypot(dx, dz), dy);
};
// The camera's vertical field of view is 70 degrees (render/lighting.js FIELD_OF_VIEW): past this
// tilt the top of the frame reaches the horizon.
const HORIZON_TILT = Math.PI / 2 - (35 * Math.PI) / 180;

// Waits until the smoothed position has caught up with the scroll, then checks the camera stands
// where the blended recipe's shot says. The director blends by smoothstep(0.5, 1, p) of the
// section's progress p (page/scrollMap.js holdThenBlend): each step holds its own recipe while its
// panel is read.
async function expectAtShot(page) {
	await page.waitForFunction((last) => {
		const s = window.__ocean.story.state();
		const r = window.__ocean.story.reading();
		const x = Math.min(Math.max((r.progress - 0.5) / 0.5, 0), 1);
		const blend = x * x * (3 - 2 * x);
		return r.phase === 'step' && s.step === r.step && (r.step === last || Math.abs(s.progress - blend) < 1e-3);
	}, STEP_COUNT, { timeout: 60_000 });
	await waitFrames(page, 2);
	const shot = (await story(page, 'recipe')).shot;
	const position = await camera(page);
	shot.position.forEach((value, i) => expect(Math.abs(position[i] - value)).toBeLessThan(0.5));
}

test.describe.configure({ timeout: 240_000 });

test('before the first scroll the ocean is left exactly as A2 built it', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page, '/ocean/', 20);
	expect(await story(page, 'started')).toBe(false);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
	const position = await camera(page);
	[0, 14, 40].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
	expect(errors).toEqual([]);
});

test('the first scroll into the sine step cuts to the white sine clipped to the graph, under its shot', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'sine', 0.1);
	await waitFrames(page, 15);
	expect(await story(page, 'started')).toBe(true);
	expect((await story(page, 'state')).step).toBe(stepOf('sine'));
	const look = await story(page, 'look');
	expect(look.mode).toBe('white');
	expect(look.wireframe).toBe(true);
	expect(look.clipped).toBe(true);
	// A tenth of the way through the section the step still holds its own recipe: the moving sine
	// only lerps in over the second half.
	expect((await story(page, 'state')).progress).toBe(0);
	expect((await story(page, 'graph')).band).toEqual([-0.5, 0.5]);
	await expectAtShot(page);
	expect(errors).toEqual([]);
});

test("the tiling step flies the camera up to its own shot, looking down, and the jonswap step brings in the FFT", async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'tiling', 0.02);
	await expectAtShot(page);
	expect((await story(page, 'state')).progress).toBeLessThan(0.05);
	const own = at('tiling').shot;
	const pose = await story(page, 'pose');
	// Within 5% of the way to the next step's shot.
	const allowed = 0.05 * length(sub(at('frequency').shot.position, own.position)) + 0.5;
	expect(length(sub(pose.position, own.position))).toBeLessThan(allowed);
	expect(pose.position[1]).toBeGreaterThan(0.9 * own.position[1]);
	const view = sub(pose.target, pose.position);
	expect(view[1] / length(view)).toBeLessThan(-0.9);
	await scrollToId(page, 'jonswap', 0.2);
	await page.waitForFunction(() => window.__ocean.status().source === 'fft', null, { timeout: 120_000 });
	expect((await story(page, 'look')).mode).toBe('painted');
});

test('a jump from the first step to the glow step cuts straight there (Review Focus 1)', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'sine', 0.1);
	await waitFrames(page, 5);
	await story(page, 'clearTrail');
	await scrollToId(page, 'glow', 0.2);
	await waitFrames(page, 10);
	const trail = await story(page, 'trail');
	expect(trail.length).toBeGreaterThan(5);
	expect(trail.every((step) => step === stepOf('sine') || step === stepOf('glow'))).toBe(true);
	expect((await story(page, 'state')).step).toBe(stepOf('glow'));
	expect((await story(page, 'look')).clipped).toBe(false);
	await expectAtShot(page);
	expect(errors).toEqual([]);
});

test('a jump into an FFT step holds the last picture until a layer rejoins, so it never shows flat water', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'many-waves', 0.3);
	await waitFrames(page, 15);
	await story(page, 'watchPictures', 40);
	await scrollToId(page, 'fft', 0.2);
	await page.waitForFunction(() => window.__ocean.story.pictures().length >= 40, null, { timeout: 60_000 });
	const pictures = await story(page, 'pictures');
	const after = pictures.filter((picture) => picture.key === stepOf('fft'));
	expect(after.length).toBeGreaterThan(20);
	// The jump did meet the rejoin (no layer runs on the bank steps), and the hold stayed short.
	const held = after.filter((picture) => picture.held);
	expect(held.length).toBeGreaterThan(0);
	expect(held.length).toBeLessThanOrEqual(10);
	expect(after.slice(0, held.length).every((picture) => picture.held)).toBe(true);
	// Every picture drawn after the jump shows waves.
	const shown = after.filter((picture) => !picture.held);
	const lowest = Math.min(...shown.map((picture) => picture.maxAbsY));
	expect(lowest).toBeGreaterThan(0.05);
	expect(errors).toEqual([]);
});

test('dragging the ocean frees the camera until the step changes, then the shot takes over', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'many-waves', 0.3);
	await waitFrames(page, 15);
	await page.mouse.move(1000, 420);
	await page.mouse.down();
	await page.mouse.move(1150, 380, { steps: 5 });
	await page.mouse.up();
	expect(await story(page, 'shotMode')).toBe('free');
	const dragged = await camera(page);
	await scrollToId(page, 'many-waves', 0.6);
	await waitFrames(page, 5);
	expect(await story(page, 'shotMode')).toBe('free');
	expect(await camera(page)).toEqual(dragged);
	await scrollToId(page, 'unlit', 0.3);
	await page.waitForFunction(() => window.__ocean.story.shotMode() === 'shot', null, { timeout: 60_000 });
	await waitFrames(page, 3);
	await expectAtShot(page);
});

test("from the highest shot no drag takes the camera past the reach or tips it to the horizon", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'layers', 0.02);
	await expectAtShot(page);
	const before = await story(page, 'pose');
	// A long drag up tilts the camera toward the horizon; a right drag would pan and a middle drag
	// would dolly out, were they on.
	await page.mouse.move(1000, 740);
	await page.mouse.down();
	await page.mouse.move(1000, 40, { steps: 10 });
	await page.mouse.up();
	for (const button of ['right', 'middle']) {
		await page.mouse.move(1000, 200);
		await page.mouse.down({ button });
		await page.mouse.move(700, 740, { steps: 8 });
		await page.mouse.up({ button });
	}
	await waitFrames(page, 3);
	expect(await story(page, 'shotMode')).toBe('free');
	const after = await story(page, 'pose');
	const tilt = await story(page, 'tilt');
	expect(length(sub(after.position, after.target))).toBeLessThanOrEqual(STORY_MAX_DISTANCE + 1e-3);
	expect(length(sub(after.target, before.target))).toBeLessThan(1e-6);
	expect(polarOf(after)).toBeGreaterThan(polarOf(before) + 0.05);
	expect(polarOf(after)).toBeLessThanOrEqual(tilt.max + 1e-6);
	expect(polarOf(after)).toBeLessThan(HORIZON_TILT);
	expect(errors).toEqual([]);
});

test('from a deck shot no drag sinks the camera into the crests', async ({ page }) => {
	await oceanRunning(page);
	// The opening camera, before the story has started.
	expect(await page.evaluate(() => document.elementFromPoint(1000, 700).id)).toBe('ocean');
	await page.mouse.move(1000, 700);
	await page.mouse.down();
	await page.mouse.move(1000, 40, { steps: 10 });
	await page.mouse.up();
	await waitFrames(page, 3);
	expect(await story(page, 'started')).toBe(false);
	expect((await camera(page))[1]).toBeGreaterThanOrEqual(14 - 1e-3);
	await scrollToId(page, 'diffuse', 0.02);
	await expectAtShot(page);
	const before = await story(page, 'pose');
	// A long drag up tips the camera toward level, lowering it toward the water; the drag also turns
	// it sideways, so it moves the camera and frees it even with the tilt pinned at the floor.
	await page.mouse.move(1000, 740);
	await page.mouse.down();
	await page.mouse.move(1150, 40, { steps: 10 });
	await page.mouse.up();
	await waitFrames(page, 3);
	expect(await story(page, 'shotMode')).toBe('free');
	const after = await story(page, 'pose');
	// The floor is 14 studs (page/orbitLimits.js CAMERA_FLOOR), or the shot's own height if lower.
	expect(after.position[1]).toBeGreaterThanOrEqual(Math.min(14, before.position[1]) - 1e-3);
});

test('the wheel over the ocean scrolls the page instead of zooming (Review Focus 2)', async ({ page }) => {
	await oceanRunning(page);
	const target = [0, 2, -120];
	const before = await camera(page);
	// Over the canvas itself, below the opening's headline.
	const [x, y] = [1000, 640];
	expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py).id, [x, y])).toBe('ocean');
	await page.mouse.move(x, y);
	// A small turn that stays in the opening, where the story leaves the camera alone: were zoom on,
	// OrbitControls would dolly the camera and keep the page from scrolling.
	await page.mouse.wheel(0, 120);
	await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 10_000 });
	await waitFrames(page, 5);
	expect(await page.evaluate(() => window.__page.reading().phase)).toBe('opening');
	expect(await story(page, 'started')).toBe(false);
	const after = await camera(page);
	expect(Math.abs(length(sub(after, target)) - length(sub(before, target)))).toBeLessThan(0.5);
});

test("the camera stays continuous across the snap into the finale's drift", async ({ page }) => {
	await oceanRunning(page);
	// Before the snap: the blend toward the finale is under half (smoothstep(0.5, 1, 0.6) = 0.1).
	await scrollToId(page, 'glow', 0.6);
	await expectAtShot(page);
	// By now a drift measured from the page's start would have turned the camera well round
	// (20 s is 30 degrees, tens of studs at the finale's radius).
	await page.waitForFunction(() => window.__ocean.status().t > 20, null, { timeout: 60_000 });
	await recordCamera(page, 150);
	await page.waitForFunction(() => window.__cameraTrail.length >= 10, null, { timeout: 30_000 });
	// Past it: smoothstep(0.5, 1, 0.9) = 0.9, the director snaps to the finale's drift at 0.5.
	await scrollToId(page, 'glow', 0.9);
	await page.waitForFunction(() => window.__cameraTrail.length >= 150, null, { timeout: 60_000 });
	const trail = await page.evaluate(() => window.__cameraTrail);
	expect(trail.some((sample) => sample.step === stepOf('glow') && sample.progress < 0.5)).toBe(true);
	expect(trail.some((sample) => sample.step === stepOf('glow') && sample.progress >= 0.5)).toBe(true);
	expect((await story(page, 'recipe')).shot.move).toBe('drift');
	expect(largestStep(trail)).toBeLessThan(8);
});

// Records the camera every frame from now until `frames` frames have passed.
async function recordCamera(page, frames) {
	await page.evaluate((count) => {
		window.__cameraTrail = [];
		const sample = () => {
			const { progress, step } = window.__ocean.story.state();
			window.__cameraTrail.push({ step, progress, position: window.__ocean.camera.position.toArray() });
			if (window.__cameraTrail.length < count) requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	}, frames);
}

function largestStep(trail) {
	let largest = 0;
	for (let i = 1; i < trail.length; i++) {
		largest = Math.max(largest, length(sub(trail[i].position, trail[i - 1].position)));
	}
	return largest;
}

test('scrolling back up out of the finale eases the camera off the drift, never jumping', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'finale', 0.1);
	await page.waitForFunction((last) => window.__ocean.story.state().step === last, STEP_COUNT, { timeout: 60_000 });
	const entered = await page.evaluate(() => window.__ocean.status().t);
	// Over 20 s of the drift: a third of a turn's worth of degrees, tens of studs round the circle.
	await page.waitForFunction((t0) => window.__ocean.status().t > t0 + 21, entered, { timeout: 90_000 });
	const drifted = await camera(page);
	expect(length(sub(drifted, recipeFor(STEP_COUNT).shot.position))).toBeGreaterThan(40);
	await recordCamera(page, 240);
	// A few frames on the drift first, so the trail holds the pose the scroll leaves from.
	await page.waitForFunction(() => window.__cameraTrail.length >= 10, null, { timeout: 30_000 });
	await scrollToId(page, 'glow', 0.6);
	await page.waitForFunction(() => window.__cameraTrail.length >= 240, null, { timeout: 60_000 });
	const trail = await page.evaluate(() => window.__cameraTrail);
	expect(trail[0].step).toBe(STEP_COUNT);
	expect(trail.some((sample) => sample.step === stepOf('glow'))).toBe(true);
	const largest = largestStep(trail);
	expect(largest, `the largest move in one frame: ${largest.toFixed(2)} studs`).toBeLessThan(8);
	// And it arrives on the blended shot.
	await page.waitForFunction(() => window.__ocean.story.shotMode() === 'shot', null, { timeout: 30_000 });
	await expectAtShot(page);
});

// The fastest the camera moves between two of the story's frames, in studs per second of the play
// clock (the clock the story moves by), so the number does not depend on the frame rate.
function fastest(trail) {
	let speed = 0;
	for (let i = 1; i < trail.length; i++) {
		const seconds = trail[i].clock - trail[i - 1].clock;
		if (seconds > 0) {
			speed = Math.max(speed, length(sub(trail[i].position, trail[i - 1].position)) / seconds);
		}
	}
	return speed;
}

// The scroll-back ease is aimed at the live blend, whose heading keeps turning: after a long dwell
// the heading gap crosses half a turn mid-ease, and a return that picked the shortest way afresh
// every frame threw the camera across the circle (73 studs in one frame after 75 s). The
// simulation of the story's camera puts the true worst case, over every dwell from 1 to 240 s at
// 30 to 120 fps, at about 470 studs a second; the flip was thousands.
const SCROLL_BACK_STUDS_PER_SECOND = 600;

test('after a long dwell in the finale, scrolling back never throws the camera across the circle', async ({ page }) => {
	test.setTimeout(300_000);
	await oceanRunning(page);
	await scrollToId(page, 'finale', 0.1);
	await page.waitForFunction((last) => window.__ocean.story.state().step === last, STEP_COUNT, { timeout: 60_000 });
	const entered = await story(page, 'clock');
	// 75 s of drift: in the old return's flip window (63 to 90 s for a scroll back to the glow step
	// at 0.6).
	await page.waitForFunction((t0) => window.__ocean.story.clock() > t0 + 75, entered, { timeout: 150_000 });
	await story(page, 'watchCamera', 300);
	await page.waitForFunction(() => window.__ocean.story.cameraTrail().length >= 5, null, { timeout: 30_000 });
	await scrollToId(page, 'glow', 0.6);
	await page.waitForFunction(() => window.__ocean.story.cameraTrail().length >= 300, null, { timeout: 60_000 });
	const trail = await story(page, 'cameraTrail');
	expect(trail[0].step).toBe(STEP_COUNT);
	expect(trail.some((frame) => frame.mode === 'returning')).toBe(true);
	const speed = fastest(trail);
	expect(speed, `the fastest the camera moved: ${speed.toFixed(0)} studs/s`).toBeLessThan(SCROLL_BACK_STUDS_PER_SECOND);
});

test("while its panel is read a step stands at its own shot (Cole's hold ruling)", async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'gerstner', 0.4);
	await expectAtShot(page);
	expect((await story(page, 'state')).progress).toBe(0);
	const position = await camera(page);
	at('gerstner').shot.position.forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
});

// C2 (Task 0 fix round 1): a camera dragged while the orbit was free (late in the sum-of-sines
// step, where the blend into into-3d has faded the graph's backdrop) goes back to the shot when
// the visitor scrolls back up the same step and the graph's hold comes on: the graph is never seen
// from off its shot.
test("a camera dragged before the graph's hold comes on eases back to the shot when it does", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'sum-of-sines', 0.95);
	await page.waitForFunction(() => window.__ocean.story.orbitEnabled() && window.__ocean.story.graph().opacity < 0.5, null, { timeout: 60_000 });
	await waitFrames(page, 5);
	await page.mouse.move(1000, 420);
	await page.mouse.down();
	await page.mouse.move(1150, 380, { steps: 5 });
	await page.mouse.up();
	expect(await story(page, 'shotMode')).toBe('free');
	await scrollToId(page, 'sum-of-sines', 0.3);
	await page.waitForFunction(() => window.__ocean.story.shotMode() === 'shot', null, { timeout: 60_000 });
	expect(await story(page, 'orbitEnabled')).toBe(false);
	expect((await story(page, 'state')).step).toBe(stepOf('sum-of-sines'));
	await expectAtShot(page);
	expect(errors).toEqual([]);
});

// C2 (Task 0 fix round 1, pre-flight R13): each phase chart reads its own step's sea. A new sea on
// the random-sea step leaves the time step's arrows on the time step's own seed.
test("New sea on the random-sea step leaves the time step's arrows on the time step's own sea", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'random-sea', 0.2);
	await waitFrames(page, 5);
	const RANDOM = stepOf('random-sea');
	const TIME = stepOf('time');
	expect(await story(page, 'seed', TIME)).toBe(at('time').engine.seed);
	const before = await story(page, 'phaseArrows', 0, TIME);
	expect(await story(page, 'phaseArrows', 0, RANDOM)).toEqual(before);
	expect(await story(page, 'press', RANDOM, 'seed')).toBe(at('random-sea').engine.seed + 1);
	expect(await story(page, 'seed', RANDOM)).toBe(at('random-sea').engine.seed + 1);
	expect(await story(page, 'seed', TIME)).toBe(at('time').engine.seed);
	expect(await story(page, 'phaseArrows', 0, TIME)).toEqual(before);
	expect(await story(page, 'phaseArrows', 0, RANDOM)).not.toEqual(before);
	expect(errors).toEqual([]);
});

test('a plain click on the ocean leaves the camera on its shot', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'many-waves', 0.3);
	await expectAtShot(page);
	expect(await page.evaluate(() => document.elementFromPoint(1000, 420).id)).toBe('ocean');
	await page.mouse.click(1000, 420);
	await waitFrames(page, 3);
	expect(await story(page, 'shotMode')).toBe('shot');
	// The shot still follows the scroll.
	await scrollToId(page, 'many-waves', 0.8);
	await expectAtShot(page);
});

test('with the scroll settled the camera is not set again every frame', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'gerstner', 0.3);
	await expectAtShot(page);
	await waitFrames(page, 5);
	const before = await story(page, 'applied');
	await waitFrames(page, 20);
	expect(await story(page, 'applied')).toBe(before);
	// A new scroll applies the moving shot again.
	await scrollToId(page, 'gerstner', 0.8);
	await waitFrames(page, 10);
	expect(await story(page, 'applied')).toBeGreaterThan(before);
});

test('a resize limits the tilt again for the new frame', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'layers', 0.02);
	await expectAtShot(page);
	const wide = await story(page, 'tilt');
	await page.setViewportSize({ width: 1840, height: 767 });
	await page.waitForFunction(() => Math.abs(window.__ocean.camera.aspect - 1840 / 767) < 1e-3, null, { timeout: 30_000 });
	await waitFrames(page, 5);
	const pose = await story(page, 'pose');
	const tier = await page.evaluate(() => window.__ocean.status().tier);
	const fov = await page.evaluate(() => window.__ocean.camera.fov);
	const expected = polarRange(pose, { aspect: 1840 / 767, fovDegrees: fov, reach: movingReach(Tier.presets[tier].rings) });
	const tilt = await story(page, 'tilt');
	expect(tilt.max).toBeCloseTo(expected.max, 6);
	expect(tilt.min).toBeCloseTo(expected.min, 6);
	expect(Math.abs(tilt.max - wide.max)).toBeGreaterThan(1e-3);
});

// The tilt range is worked out again on a resize even where the story does not place the camera
// that frame: at the opening (the story not started) and with the visitor holding the camera.
test('a resize re-limits the tilt at the opening and while the visitor holds the camera', async ({ page }) => {
	await oceanRunning(page);
	expect(await story(page, 'started')).toBe(false);
	await page.setViewportSize({ width: 1600, height: 767 });
	await page.waitForFunction(() => Math.abs(window.__ocean.story.tilt().aspect - 1600 / 767) < 1e-6, null, { timeout: 10_000 });
	await scrollToId(page, 'layers', 0.02);
	await expectAtShot(page);
	await page.mouse.move(1000, 600);
	await page.mouse.down();
	await page.mouse.move(1150, 560, { steps: 5 });
	await page.mouse.up();
	expect(await story(page, 'shotMode')).toBe('free');
	await page.setViewportSize({ width: 1840, height: 767 });
	await page.waitForFunction(() => Math.abs(window.__ocean.story.tilt().aspect - 1840 / 767) < 1e-6, null, { timeout: 10_000 });
	expect(await story(page, 'shotMode')).toBe('free');
	// Worked out for the layers step's own shot (where the story last put the camera) at the new aspect.
	const tier = await page.evaluate(() => window.__ocean.status().tier);
	const fov = await page.evaluate(() => window.__ocean.camera.fov);
	const expected = polarRange(at('layers').shot, { aspect: 1840 / 767, fovDegrees: fov, reach: movingReach(Tier.presets[tier].rings) });
	const tilt = await story(page, 'tilt');
	expect(tilt.max).toBeCloseTo(expected.max, 6);
	expect(tilt.min).toBeCloseTo(expected.min, 6);
});

test('scrolling back to the opening shows the finished sea under the opening camera', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'moving-sine', 0.3);
	await waitFrames(page, 10);
	await scrollToOpening(page);
	await waitFrames(page, 10);
	expect((await story(page, 'state')).step).toBe(STEP_COUNT);
	expect((await story(page, 'look')).mode).toBe('painted');
	expect((await story(page, 'look')).clipped).toBe(false);
	const position = await camera(page);
	[0, 14, 40].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 1));
});

test.describe('under reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test("each step's own shot, with no blending toward the next", async ({ page }) => {
		await oceanRunning(page);
		await scrollToId(page, 'gerstner', 0.5);
		await waitFrames(page, 5);
		const position = await camera(page);
		at('gerstner').shot.position.forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
	});
});

// A real touch swipe over the canvas (Chromium's synthetic scroll gesture honours touch-action).
async function swipeUp(page, x, y) {
	const client = await page.context().newCDPSession(page);
	await client.send('Input.synthesizeScrollGesture', { x, y, yDistance: -300, speed: 800, gestureSourceType: 'touch' });
	await client.detach();
}

test.describe('on a touch-first phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('a touch-first screen gets no orbit, so a swipe over the ocean scrolls (Review Focus 2)', async ({ page }) => {
		await oceanRunning(page);
		expect(await page.evaluate(() => document.getElementById('ocean').style.touchAction)).toBe('pan-y');
		expect(await story(page, 'orbitEnabled')).toBe(false);
		const [x, y] = [195, 300];
		expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py).id, [x, y])).toBe('ocean');
		await swipeUp(page, x, y);
		await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 10_000 });
	});
});

// A touch laptop: the mouse is the primary pointer, the touch screen another. Chromium cannot
// emulate that mix, so the page is told it through matchMedia.
test.describe('on a touch laptop', () => {
	test.use({ hasTouch: true });

	test('the mouse keeps its orbit, and a vertical swipe over the ocean still scrolls', async ({ page }) => {
		await page.addInitScript(() => {
			const native = window.matchMedia.bind(window);
			const forced = { '(pointer: coarse)': false, '(any-pointer: coarse)': true };
			window.matchMedia = (query) => {
				if (!(query in forced)) return native(query);
				const quiet = () => {};
				return { matches: forced[query], media: query, onchange: null, addEventListener: quiet, removeEventListener: quiet, addListener: quiet, removeListener: quiet };
			};
		});
		await oceanRunning(page);
		expect(await page.evaluate(() => document.getElementById('ocean').style.touchAction)).toBe('pan-y');
		expect(await story(page, 'orbitEnabled')).toBe(true);
		const [x, y] = [1000, 640];
		expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py).id, [x, y])).toBe('ocean');
		await swipeUp(page, x, y);
		await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 10_000 });
	});
});
