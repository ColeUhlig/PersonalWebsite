// The page's shared motion helpers (piece C final review fix 6): one smoothstep for the scroll
// blend, the tilt's ease back and the shot's return, and one cap on a frame's seconds for the story
// clock and the tilt.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { MAX_FRAME_SECONDS, smoothstep } from '../../../content/ocean/js/page/motion.js';

const JS = fileURLToPath(new URL('../../../content/ocean/js/', import.meta.url));

test('smoothstep eases 0 to 1 with flat ends, symmetric about the middle', () => {
	expect.equal(smoothstep(0), 0, 'start');
	expect.equal(smoothstep(1), 1, 'end');
	expect.equal(smoothstep(0.5), 0.5, 'middle');
	expect.near(smoothstep(0.8), 0.896, 1e-12, '0.8');
	for (const x of [0.1, 0.25, 0.4]) {
		expect.near(smoothstep(x) + smoothstep(1 - x), 1, 1e-12, `symmetric at ${x}`);
	}
	expect.near((smoothstep(1e-6) - smoothstep(0)) / 1e-6, 0, 1e-5, 'flat at the start');
});

test('a frame counts for at most a quarter of a second', () => {
	expect.equal(MAX_FRAME_SECONDS, 0.25, 'cap');
});

test('the modules that ease share the one smoothstep and the one frame cap', () => {
	for (const path of ['page/scrollMap.js', 'page/tiltLook.js', 'page/shotControl.js', 'ui/storyStage.js']) {
		const source = readFileSync(`${JS}${path}`, 'utf8');
		expect.truthy(!/3 - 2 \*/.test(source), `${path} writes no smoothstep of its own`);
		expect.truthy(!/MAX_(FRAME|STEP)_SECONDS\s*=/.test(source), `${path} defines no frame cap of its own`);
		expect.truthy(source.includes("from './motion.js'") || source.includes("from '../page/motion.js'"), `${path} imports page/motion.js`);
	}
});
