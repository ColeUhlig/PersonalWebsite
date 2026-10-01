// Tilting a phone to look around the ocean (piece C Task 9b): on a touch-first screen the phone's
// orientation swings the camera a few degrees round the current shot, within the orbit limits; iOS
// asks for motion access from a tap on a button; desktops and reduced motion get nothing. The
// orientation is faked with DeviceOrientationEvent; shot numbers come from the recipes themselves.
import { test, expect } from '@playwright/test';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { CAMERA_FLOOR } from '../../../content/ocean/js/page/orbitLimits.js';
import { RETURN_SECONDS, TILT_LIMITS } from '../../../content/ocean/js/page/tiltLook.js';
import { oceanRunning, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

const DEG = Math.PI / 180;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// A little slack on the limits for the float round trip through OrbitControls.
const SLACK = 0.05 * DEG;

const story = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.story[n](...a), [name, args]);
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

// Waits until the camera stands on step `n`'s own shot (the panel being read holds its shot).
async function settleOn(page, n) {
	await scrollToStep(page, n, 0.2);
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
		const shot = await settleOn(page, 3);
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
		const shot = await settleOn(page, 3);
		// The scroll into step 3 was a step change: the tilt eases back and takes a new baseline.
		await waitClock(page, RETURN_SECONDS + 0.3);
		// Five degrees to the right: the view turns right, the camera clockwise from above.
		await tilt(page, 45, 5);
		await waitClock(page, 2);
		let turn = turnFrom(shot, await story(page, 'pose'));
		expect(turn.yaw).toBeCloseTo(-5 * DEG, 3);
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
		// Standing the phone up asks for 8 degrees down; step 3's shot is 18 studs up and 77 out, so
		// the floor stops it first.
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
		expect(turn.yaw).toBeCloseTo(8 * DEG, 3);
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
		await settleOn(page, 3);
		await waitClock(page, RETURN_SECONDS + 0.3);
		await tilt(page, 45, 40);
		await waitClock(page, 2);
		expect((await page.evaluate(() => window.__tilt.offset())).yaw).toBeCloseTo(-TILT_LIMITS.yawDeg * DEG, 3);
		// The phone stays tilted while the story moves on.
		await page.evaluate(() => {
			window.__offsets = [];
			const record = () => {
				window.__offsets.push({ clock: window.__ocean.story.clock(), step: window.__ocean.story.state().step, yaw: window.__tilt.offset().yaw });
				if (window.__offsets.length < 600) requestAnimationFrame(record);
			};
			requestAnimationFrame(record);
		});
		await waitFrames(page, 5);
		const shot = await settleOn(page, 4);
		await waitClock(page, 2);
		const offsets = await page.evaluate(() => window.__offsets);
		const changed = offsets.findIndex((o) => o.step === 4);
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
	// pose, or the tilt is added twice and the camera jumps by it (about 34 studs at step 13).
	test('scrolling back out of the finale with the phone tilted never jumps the camera', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(openPhone);
		await oceanRunning(page);
		await startTilting(page);
		await scrollToStep(page, 13, 0.1);
		await page.waitForFunction(() => window.__ocean.story.state().step === 13, null, { timeout: 60_000 });
		await waitClock(page, RETURN_SECONDS + 0.3);
		await tilt(page, 45, 40);
		await waitClock(page, 2);
		await story(page, 'watchCamera', 180);
		await page.waitForFunction(() => window.__ocean.story.cameraTrail().length >= 5, null, { timeout: 30_000 });
		await scrollToStep(page, 12, 0.6);
		await page.waitForFunction(() => window.__ocean.story.cameraTrail().length >= 180, null, { timeout: 60_000 });
		const trail = await story(page, 'cameraTrail');
		expect(trail[0].step).toBe(13);
		expect(trail.some((frame) => frame.mode === 'returning')).toBe(true);
		let largest = 0;
		for (let i = 1; i < trail.length; i++) {
			largest = Math.max(largest, Math.hypot(...sub(trail[i].position, trail[i - 1].position)));
		}
		expect(largest, `the largest move in one frame: ${largest.toFixed(2)} studs`).toBeLessThan(8);
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
		const shot = await settleOn(page, 3);
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
		expect(turn.yaw).toBeCloseTo(-6 * DEG, 3);
		expect(errors).toEqual([]);
	});

	test('a refusal says so, leaves the camera on the shot, and the button goes', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(askingPhone, 'denied');
		await oceanRunning(page);
		const shot = await settleOn(page, 3);
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

	test('the button sits over the ocean, clear of the motion button, and shows a focus ring', async ({ page }) => {
		await page.addInitScript(askingPhone, 'granted');
		await oceanRunning(page);
		const button = page.locator('#tilt');
		await expect(button).toBeVisible();
		await expect(page.locator('#motion')).toBeVisible();
		const box = await button.boundingBox();
		const motion = await page.locator('#motion').boundingBox();
		const canvas = await page.evaluate(() => document.getElementById('ocean').getBoundingClientRect().toJSON());
		expect(box.y + box.height).toBeLessThanOrEqual(canvas.bottom);
		expect(box.x + box.width).toBeLessThanOrEqual(390);
		const apart = box.y + box.height <= motion.y || motion.y + motion.height <= box.y || box.x + box.width <= motion.x || motion.x + motion.width <= box.x;
		expect(apart).toBe(true);
		await button.focus();
		const outline = await button.evaluate((el) => {
			const style = getComputedStyle(el);
			return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
		});
		expect(outline.style).not.toBe('none');
		expect(outline.width).toBeGreaterThanOrEqual(2);
	});
});

test.describe('under reduced motion', () => {
	test.use({ ...PHONE, reducedMotion: 'reduce' });

	test('there is no button and orientation events do nothing', async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(askingPhone, 'granted');
		await oceanRunning(page);
		const shot = await settleOn(page, 3);
		expect(await page.locator('#tilt').isHidden()).toBe(true);
		expect(await tiltState(page)).toBe('off');
		await tilt(page, 45, 0);
		await tilt(page, 45, 9);
		await waitFrames(page, 30);
		const turn = turnFrom(shot, await story(page, 'pose'));
		expect(Math.abs(turn.yaw)).toBeLessThan(1e-6);
		expect(errors).toEqual([]);
	});
});
