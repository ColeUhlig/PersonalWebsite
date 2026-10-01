// The finale's live numbers as rows (piece C, Task 9): page/liveSummary.js. Measured in the
// visitor's browser; never a Roblox figure, never the deferred Unleashed mode.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { MEASURING, summarizeLive } from '../../../content/ocean/js/page/liveSummary.js';

const STATUS = { frame: 900, tier: 'High', tierReason: 'probe', vertices: 18144, mode: 'workers', fallbackReason: null, layers: [true, true, true] };
const REPORT = { writeMs: 2.345, paintMs: 0.5, strengthMs: 0.07, renderMs: 4.2, cascadeMs: 6.1 };
const value = (summary, label) => summary.rows.find((row) => row.label === label)?.value;

test('the rows say what was measured, with units', () => {
	const summary = summarizeLive({ status: STATUS, report: REPORT, fps: 58 });
	expect.equal(value(summary, 'Frame rate'), '58 fps', 'fps');
	expect.equal(value(summary, 'Surface points'), '18,144', 'points');
	expect.equal(value(summary, 'Quality tier'), 'High', 'tier');
	expect.equal(value(summary, 'Wave layers'), '3', 'layers');
	expect.equal(value(summary, 'Waves computed on'), 'worker threads', 'workers');
	expect.equal(value(summary, 'Writing the points'), '2.35 ms', 'write');
	expect.equal(value(summary, 'Drawing the frame'), '4.20 ms', 'render');
	expect.equal(summary.phoneRule, false, 'not a phone');
	expect.equal(summary.measuring, false, 'a report has arrived');
	expect.equal(value(summary, 'Ocean'), undefined, 'no paused row while it moves');
});

test('the phone rule and a main-thread fallback are said plainly', () => {
	const summary = summarizeLive({ status: { ...STATUS, tier: 'Medium', tierReason: 'phone rule', vertices: 6480, mode: 'main-thread', fallbackReason: 'worker failed to start', layers: [true, true] }, report: null, fps: 31 });
	expect.equal(summary.phoneRule, true, 'phone');
	expect.truthy(value(summary, 'Quality tier').includes('phone rule'), value(summary, 'Quality tier'));
	expect.truthy(value(summary, 'Quality tier').includes('unmeasured'), value(summary, 'Quality tier'));
	expect.equal(value(summary, 'Waves computed on'), 'the main thread (worker failed to start)', 'fallback');
	expect.equal(value(summary, 'Per-stage timings'), MEASURING, 'no report yet');
});

// The 2026-09-30 ruling: the block never shows empty or a made-up figure while the first
// 300-frame window is still running, and a frame rate with nothing to average says so too.
test('before the first report and the first interval, the rows say they are measuring', () => {
	const summary = summarizeLive({ status: STATUS, report: null, fps: null });
	expect.equal(summary.measuring, true, 'measuring');
	expect.equal(value(summary, 'Frame rate'), MEASURING, 'no interval yet');
	expect.equal(value(summary, 'Per-stage timings'), MEASURING, 'no report yet');
	expect.truthy(MEASURING.startsWith('measuring'), MEASURING);
	expect.equal(value(summary, 'Writing the points'), undefined, 'no timing rows yet');
	for (const fps of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
		expect.equal(value(summarizeLive({ status: STATUS, report: REPORT, fps }), 'Frame rate'), MEASURING, String(fps));
	}
});

test('a paused ocean says so, and a missing figure or fallback reason never prints as null', () => {
	const summary = summarizeLive({ status: { ...STATUS, mode: 'main-thread', fallbackReason: null, layers: null }, report: { ...REPORT, cascadeMs: null }, fps: 60, paused: true });
	expect.truthy(value(summary, 'Ocean').startsWith('paused'), value(summary, 'Ocean'));
	expect.equal(value(summary, 'Waves computed on'), 'the main thread', 'no reason given');
	expect.equal(value(summary, "One layer's FFT, on its worker"), '-', 'no worker reply measured');
	expect.equal(value(summary, 'Wave layers'), '-', 'no layer flags');
	for (const row of summary.rows) {
		expect.truthy(!/null|undefined|NaN/.test(row.value), `${row.label}: ${row.value}`);
	}
});

test('the rows never claim a Roblox figure or the deferred Unleashed mode', () => {
	for (const summary of [summarizeLive({ status: STATUS, report: REPORT, fps: 58, paused: true }), summarizeLive({ status: STATUS, report: null, fps: null })]) {
		const text = summary.rows.map((row) => `${row.label} ${row.value}`).join(' ');
		expect.truthy(!/roblox|studio|unleashed/i.test(text), text);
	}
});
