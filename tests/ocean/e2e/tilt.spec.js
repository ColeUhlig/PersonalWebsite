// Tilting a phone to look around the ocean (piece C Task 9b): on a touch-first screen the phone's
// orientation swings the camera a few degrees round the current shot, within the orbit limits; iOS
// asks for motion access from a tap on a button; desktops and reduced motion get nothing. The
// orientation is faked with DeviceOrientationEvent; shot numbers come from the recipes themselves.
// The tilted shots are the foam and glow steps' (chapters/finish.js), which no C2 lane tunes.
import { test, expect } from '@playwright/test';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { CAMERA_FLOOR } from '../../../content/ocean/js/page/orbitLimits.js';
import { DEAD_BAND_DEG, RETURN_SECONDS, TILT_LIMITS } from '../../../content/ocean/js/page/tiltLook.js';
import { oceanRunning, scrollToId, waitFrames, watchErrors } from './helpers/story.js';
import { story } from './helpers/stage.js';

const DEG = Math.PI / 180;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// A little slack on the limits for the float round trip through OrbitControls.
const SLACK = 0.05 * DEG;
// A turn of `degrees` once the dead band is taken off.
const banded = (degrees) => Math.sign(degrees) * (Math.abs(degrees) - DEAD_BAND_DEG) * DEG;

const tiltState = (page) => page.evaluate(() => window.__tilt?.state() ?? null);
const tilt = (page, beta, gamma) =>
	page.evaluate(([b, g]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })), [beta, gamma]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const spherical = (pose) => {
	const [dx, dy, dz] = sub(pose.position, pose.target);
	return { radius: Math.hypot(dx, dy, dz), polar: Math.atan2(Math.hypot(dx, dz), dy), azimuth: Math.atan2(dx, dz) };
};
// The camera's turn from the shot: yaw counter-clockwise seen from above, pitch upwards, radians.
function turnFrom(shot, pose) {
	const a = spherical(shot);
	const b = spherical(pose);
	let yaw = (b.azimuth - a.azimuth) % (2 * Math.PI);
	if (yaw > Math.PI) yaw -= 2 * Math.PI;
	if (yaw <= -Math.PI) yaw += 2 * Math.PI;
	return { yaw, pitch: a.polar - b.polar, radius: b.radius - a.radius };
}

// Waits until the camera stands on the step `id`'s own shot (the panel being read holds its shot).
async function settleOn(page, id) {
	const n = stepOf(id);
	await scrollToId(page, id, 0.2);
	const shot = recipeFor(n).shot;
	await page.waitForFunction((target) => {
		const s = window.__ocean.story.state();
		const p = window.__ocean.camera.position.toArray();
		return s.step === target.n && s.progress === 0 && p.every((v, i) => Math.abs(v - target.position[i]) < 0.01);
	}, { n, position: shot.position }, { timeout: 60_000 });
	return shot;
}

// Plays `seconds` of the play clock.
async function waitClock(page, seconds) {
	const start = await story(page, 'clock');
	await page.waitForFunction((end) => window.__ocean.story.clock() >= end, start + seconds, { timeout: 30_000 });
	await waitFrames(page, 2);
}

// Android turns tilt on at the first reading, and gives up if none comes within 3 s, so the
// first one is sent as soon as the ocean runs.
async function startTilting(page) {
	await tilt(page, 45, 0);
	await page.waitForFunction(() => window.__tilt?.state() === 'on', null, { timeout: 5_000 });
}

// A phone that needs a tap for motion access (iOS), answering `answer`; counts the requests. An
// init script runs in the page, so the answer goes in as its argument, never through a closure.
const askingPhone = (answer) => {
	window.__permissionRequests = 0;
	DeviceOrientationEvent.requestPermission = () => {
		window.__permissionRequests += 1;
		return Promise.resolve(answer);
	};
};
// A phone that sends orientation without asking (Android).
const openPhone = () => {
	delete DeviceOrientationEvent.requestPermission;
};

test.describe.configure({ timeout: 180_000 });

test.describe('on a desktop (a fine pointer)', () => {
	test('there is no button and orientation events do nothing', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(askingPhone, 'granted');
		await oceanRunning(page);
		const shot = await settleOn(page, 'foam');
		expect(await page.locator('#tilt').isHidden()).toBe(true);
		expect(await tiltState(page)).toBe('off');
		const applied = await story(page, 'applied');
		await tilt(page, 45, 0);
		await tilt(page, 60, 30);
		await waitClock(page, 1);
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-6);
		expect(Math.abs(turn.pitch)).toBeLessThan(1e-6);
		expect(await story(page, 'applied')).toBe(applied);
		expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
		expect(errors).toEqual([]);
	});
});

test.describe('on a phone that sends orientation without asking (Android)', () => {
	test.use(PHONE);

	test('tilting turns the camera round the shot, within the limits and above the floor', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		expect(await page.locator('#tilt').isHidden()).toBe(true);
		const shot = await settleOn(page, 'foam');
		// The scroll into the step was a step change: the tilt eases back and takes a new baseline.
		await waitClock(page, RETURN_SECONDS + 0.3);
		// Five degrees to the right: the view turns right, the camera clockwise from above.
		await tilt(page, 45, 5);
		await waitClock(page, 2);
		let turn = turnFrom(shot, await story(page, 'pose'));
		expect(turn.yaw).toBeCloseTo(banded(-5), 3);
		expect(Math.abs(turn.pitch)).toBeLessThan(1e-4);
		expect(Math.abs(turn.radius)).toBeLessThan(1e-3);
		// Extreme readings: each axis stops at its limit, and laying the phone back far enough to
		// drop the camera stops it at the floor.
		for (const [beta, gamma] of [[179, 89], [-30, -89], [170, -60]]) {
			await tilt(page, beta, gamma);
			await story(page, 'watchCamera', 90);
			await waitClock(page, 1.5);
			turn = turnFrom(shot, await story(page, 'pose'));
			expect(Math.abs(turn.yaw)).toBeLessThanOrEqual(TILT_LIMITS.yawDeg * DEG + SLACK);
			expect(Math.abs(turn.pitch)).toBeLessThanOrEqual(TILT_LIMITS.pitchDeg * DEG + SLACK);
			const trail = await story(page, 'cameraTrail');
			expect(trail.length).toBeGreaterThan(10);
			for (const frame of trail) expect(frame.position[1]).toBeGreaterThanOrEqual(CAMERA_FLOOR - 1e-6);
		}
		// Standing the phone up asks for the full pitch down; from the foam shot (chapters/finish.js,
		// which no lane tunes) that would take the camera under the floor, so the floor stops it first.
		// Worked out from the shot, so the check fails loudly if the shot ever stops reaching it.
		const { radius, polar } = spherical(shot);
		expect(shot.target[1] + radius * Math.cos(polar + TILT_LIMITS.pitchDeg * DEG)).toBeLessThan(CAMERA_FLOOR);
		await tilt(page, 45, 0);
		await waitClock(page, 2);
		await tilt(page, 75, 0);
		await waitClock(page, 2);
		const pose = await story(page, 'pose');
		expect(pose.position[1]).toBeCloseTo(CAMERA_FLOOR, 3);
		expect(turnFrom(shot, pose).pitch).toBeGreaterThan(-TILT_LIMITS.pitchDeg * DEG);
		expect(errors).toEqual([]);
	});

	test('before the first scroll, tilting swings the camera round the opening shot and puts it back', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		expect(await story(page, 'started')).toBe(false);
		const opening = { position: [0, 14, 40], target: [0, 2, -120] };
		await tilt(page, 45, -8);
		await waitClock(page, 2);
		const turn = turnFrom(opening, await story(page, 'pose'));
		expect(turn.yaw).toBeCloseTo(banded(8), 3);
		await tilt(page, 45, 0);
		await waitClock(page, 3);
		const pose = await story(page, 'pose');
		opening.position.forEach((v, i) => expect(pose.position[i]).toBeCloseTo(v, 6));
		opening.target.forEach((v, i) => expect(pose.target[i]).toBeCloseTo(v, 6));
		expect(errors).toEqual([]);
	});

	test('a step change eases the camera back onto the new shot', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		await settleOn(page, 'foam');
		await waitClock(page, RETURN_SECONDS + 0.3);
		await tilt(page, 45, 40);
		await waitClock(page, 2);
		expect((await page.evaluate(() => window.__tilt.offset())).yaw).toBeCloseTo(-TILT_LIMITS.yawDeg * DEG, 3);
		// The phone stays tilted while the story moves on to the next step (foam -> glow: shots no
		// C2 lane tunes, chapters/finish.js).
		await page.evaluate(() => {
			window.__offsets = [];
			const record = () => {
				window.__offsets.push({ clock: window.__ocean.story.clock(), step: window.__ocean.story.state().step, yaw: window.__tilt.offset().yaw });
				if (window.__offsets.length < 600) requestAnimationFrame(record);
			};
			requestAnimationFrame(record);
		});
		await waitFrames(page, 5);
		const shot = await settleOn(page, 'glow');
		await waitClock(page, 2);
		const offsets = await page.evaluate(() => window.__offsets);
		const changed = offsets.findIndex((o) => o.step === stepOf('glow'));
		expect(changed).toBeGreaterThan(0);
		const after = offsets.slice(changed);
		// It eased: part-way values on the way back, never a cut.
		expect(after.some((o) => Math.abs(o.yaw) > 0.2 * TILT_LIMITS.yawDeg * DEG && Math.abs(o.yaw) < 0.8 * TILT_LIMITS.yawDeg * DEG)).toBe(true);
		// Back on the shot within the return (with a little slack for frames).
		const back = after.find((o) => o.yaw === 0);
		expect(back).toBeTruthy();
		expect(back.clock - after[0].clock).toBeLessThan(RETURN_SECONDS + 0.3);
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-4);
		expect(Math.abs(turn.pitch)).toBeLessThan(1e-4);
		expect(errors).toEqual([]);
	});

	// The finale's drift lets go as the visitor scrolls back up, and the camera eases from where it
	// stands to the shot. Where it stands includes the tilt; that ease must start from the shot's own
	// pose, or the tilt is added twice and the camera jumps by it (about 34 studs at the finale).
	test('scrolling back out of the finale with the phone tilted never jumps the camera', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		await scrollToId(page, 'finale', 0.1);
		await page.waitForFunction((last) => window.__ocean.story.state().step === last, STEP_COUNT, { timeout: 60_000 });
		await waitClock(page, RETURN_SECONDS + 0.3);
		await tilt(page, 45, 40);
		await waitClock(page, 2);
		await story(page, 'watchCamera', 180);
		await page.waitForFunction(() => window.__ocean.story.cameraTrail().length >= 5, null, { timeout: 30_000 });
		await scrollToId(page, 'glow', 0.6);
		await page.waitForFunction(() => window.__ocean.story.cameraTrail().length >= 180, null, { timeout: 60_000 });
		const trail = await story(page, 'cameraTrail');
		expect(trail[0].step).toBe(STEP_COUNT);
		expect(trail.some((frame) => frame.mode === 'returning')).toBe(true);
		let largest = 0;
		for (let i = 1; i < trail.length; i++) {
			largest = Math.max(largest, Math.hypot(...sub(trail[i].position, trail[i - 1].position)));
		}
		expect(largest, `the largest move in one frame: ${largest.toFixed(2)} studs`).toBeLessThan(8);
		expect(errors).toEqual([]);
	});

	// C2 (Task 0 fix round 1): the flat graph holds the camera, so a tilted phone leaves it on the
	// graph's shot; the follower eases the offset out as the hold comes on (page/tiltLook.test.js).
	test("on the flat graph a tilted phone leaves the camera on the graph's shot", async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		const shot = await settleOn(page, 'sine');
		await waitClock(page, RETURN_SECONDS + 0.3);
		await tilt(page, 45, 40);
		await waitClock(page, 2);
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-4);
		expect(Math.abs(turn.pitch)).toBeLessThan(1e-4);
		expect((await page.evaluate(() => window.__tilt.offset())).yaw).toBe(0);
		expect(errors).toEqual([]);
	});

	// A phone held still still reports a little noise; under the dead band it is no turn, so the
	// story stops putting the camera anywhere new.
	test("a still phone's sensor noise leaves the camera alone", async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		const shot = await settleOn(page, 'foam');
		await waitClock(page, RETURN_SECONDS + 0.3);
		const noise = [[45.04, 0.03], [44.97, -0.05], [45.02, 0.06], [44.95, -0.02], [45.05, 0.04]];
		await page.evaluate((readings) => {
			let i = 0;
			window.__noise = setInterval(() => {
				const [beta, gamma] = readings[i++ % readings.length];
				window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0.02 * (i % 3), beta, gamma }));
			}, 16);
		}, noise);
		await waitClock(page, 0.5);
		const applied = await story(page, 'applied');
		await waitClock(page, 1);
		expect(await story(page, 'applied')).toBe(applied);
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-9);
		expect(Math.abs(turn.pitch)).toBeLessThan(1e-9);
		await page.evaluate(() => clearInterval(window.__noise));
		expect(errors).toEqual([]);
	});

	test('a phone that sends no reading within 3 s has no tilt, and a late one does nothing', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		expect(await tiltState(page)).toBe('off');
		await page.waitForFunction(() => window.__tilt.state() === 'unsupported', null, { timeout: 10_000 });
		expect(await page.locator('#tilt').isHidden()).toBe(true);
		const shot = await settleOn(page, 'foam');
		await tilt(page, 45, 0);
		await tilt(page, 45, 9);
		await waitClock(page, 1);
		expect(await tiltState(page)).toBe('unsupported');
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-6);
		expect(errors).toEqual([]);
	});
});

test.describe('on a phone that asks for motion access (iOS)', () => {
	test.use(PHONE);

	test('the button shows, nothing happens before the tap, and after it tilting turns the camera', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(askingPhone, 'granted');
		await oceanRunning(page);
		const button = page.locator('#tilt');
		await expect(button).toBeVisible();
		await expect(button).toHaveText('Tilt to look around');
		expect(await tiltState(page)).toBe('needs-permission');
		const shot = await settleOn(page, 'foam');
		await tilt(page, 45, 0);
		await tilt(page, 45, 6);
		await waitClock(page, 1);
		let turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-6);
		expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
		await button.tap();
		await expect(button).toBeHidden();
		expect(await tiltState(page)).toBe('on');
		expect(await page.evaluate(() => window.__permissionRequests)).toBe(1);
		await tilt(page, 45, 0);
		await waitClock(page, 0.5);
		await tilt(page, 45, 6);
		await waitClock(page, 2);
		turn = turnFrom(shot, await story(page, 'pose'));
		expect(turn.yaw).toBeCloseTo(banded(-6), 3);
		expect(errors).toEqual([]);
	});

	test('a refusal says so, leaves the camera on the shot, and the button goes', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(askingPhone, 'denied');
		await oceanRunning(page);
		const shot = await settleOn(page, 'foam');
		const button = page.locator('#tilt');
		await button.tap();
		await expect(button).toHaveText('Motion access was denied');
		expect(await tiltState(page)).toBe('denied');
		await tilt(page, 45, 0);
		await tilt(page, 45, 9);
		await waitClock(page, 1);
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-6);
		await expect(button).toBeHidden({ timeout: 6_000 });
		expect(errors).toEqual([]);
	});

	test('the button shows a visible focus ring', async ({ page }) => {
		await page.addInitScript(askingPhone, 'granted');
		await oceanRunning(page);
		const button = page.locator('#tilt');
		await expect(button).toBeVisible();
		await button.focus();
		const outline = await button.evaluate((el) => {
			const style = getComputedStyle(el);
			return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
		});
		expect(outline.style).not.toBe('none');
		expect(outline.width).toBeGreaterThanOrEqual(2);
	});
});

// Where the pills (the tilt and motion buttons) land on touch screens, through the whole page: they
// never overlap each other, never cover readable text, and on a narrow screen sit over the ocean's
// half. Text counts as covered when it is the top thing at the overlap (the Task 9b review's check):
// text the ocean's canvas already hides on a narrow screen does not count.
async function pillProblems(page, scrolls) {
	const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
	const problems = [];
	for (let i = 0; i <= scrolls; i++) {
		await page.evaluate((y) => window.scrollTo(0, y), Math.round((total * i) / scrolls));
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		const found = await page.evaluate(() => {
			const hit = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
			const pills = ['tilt', 'motion'].map((id) => document.getElementById(id)).filter((b) => !b.hidden);
			const boxes = pills.map((b) => b.getBoundingClientRect());
			const out = [];
			if (boxes.length === 2 && hit(boxes[0], boxes[1])) out.push('the pills overlap');
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
			for (let n = walker.nextNode(); n; n = walker.nextNode()) {
				if (!n.textContent.trim() || pills.some((b) => b.contains(n))) continue;
				const range = document.createRange();
				range.selectNodeContents(n);
				for (const rect of range.getClientRects()) {
					for (const box of boxes) {
						if (!hit(rect, box)) continue;
						const x = (Math.max(rect.left, box.left) + Math.min(rect.right, box.right)) / 2;
						const y = (Math.max(rect.top, box.top) + Math.min(rect.bottom, box.bottom)) / 2;
						const top = document.elementsFromPoint(x, y).find((e) => !pills.some((b) => b === e || b.contains(e)) && !e.classList.contains('pills'));
						if (top && (top === n.parentElement || top.contains(n.parentElement) || n.parentElement.contains(top))) {
							out.push(`covers "${n.textContent.trim().slice(0, 30)}" at scroll ${Math.round(window.scrollY)}`);
						}
					}
				}
			}
			return out;
		});
		problems.push(...found);
	}
	return [...new Set(problems)];
}

const SCREENS = [
	{ width: 390, height: 844 },
	{ width: 1024, height: 768 },
	{ width: 932, height: 430 },
	{ width: 1180, height: 820 },
];

for (const { width, height } of SCREENS) {
	test.describe(`the pills on a ${width} × ${height} touch screen`, () => {
		test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

		test('never overlap each other or cover text, anywhere on the page', async ({ page }) => {
			test.setTimeout(240_000);
			await page.addInitScript(askingPhone, 'granted');
			await oceanRunning(page);
			await expect(page.locator('#tilt')).toBeVisible();
			await expect(page.locator('#motion')).toBeVisible();
			if (width < 900) {
				const canvas = await page.evaluate(() => document.getElementById('ocean').getBoundingClientRect().toJSON());
				for (const id of ['#tilt', '#motion']) {
					const box = await page.locator(id).boundingBox();
					expect(box.y + box.height).toBeLessThanOrEqual(canvas.bottom);
					expect(box.x + box.width).toBeLessThanOrEqual(width);
				}
			}
			expect(await pillProblems(page, 40)).toEqual([]);
		});
	});
}

test.describe('the pills with the text at twice its size', () => {
	test.use({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true });

	test('still never overlap each other or cover text', async ({ page }) => {
		test.setTimeout(240_000);
		await page.addInitScript(askingPhone, 'denied');
		await page.addInitScript(() => {
			document.addEventListener('DOMContentLoaded', () => {
				document.documentElement.style.fontSize = '200%';
			});
		});
		await oceanRunning(page);
		await page.locator('#tilt').tap();
		await expect(page.locator('#tilt')).toHaveText('Motion access was denied');
		expect(await pillProblems(page, 20)).toEqual([]);
	});
});

test.describe('under reduced motion', () => {
	test.use({ ...PHONE, reducedMotion: 'reduce' });

	// Reduced motion starts the clock stopped, and a stopped clock freezes the tilt anyway; the clock
	// is played here so the camera could move if tilt were on.
	test('orientation events do nothing, even with the ocean playing', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		const shot = await settleOn(page, 'foam');
		await page.locator('#motion').tap();
		await expect(page.locator('#motion')).toHaveText('Pause the ocean');
		await tilt(page, 45, 0);
		await waitClock(page, 0.3);
		await tilt(page, 45, 9);
		await waitClock(page, 1.5);
		expect(await tiltState(page)).toBe('off');
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-6);
		expect(errors).toEqual([]);
	});

	test('a phone that asks for motion access gets no button', async ({ page }) => {
		await page.addInitScript(askingPhone, 'granted');
		await oceanRunning(page);
		await waitFrames(page, 10);
		expect(await page.locator('#tilt').isHidden()).toBe(true);
		expect(await tiltState(page)).toBe('off');
		expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
	});
});
