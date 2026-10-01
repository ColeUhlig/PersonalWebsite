// The finale's live numbers (piece C; spec 1: web numbers "measured live in the visitor's browser
// and labelled as such"; spec 7: the performance readout doubles as the page's live numbers).
// Browser-free: turns the ocean's status and report (the Roblox report line's fields, measured
// here) and a frame rate into labelled rows, and says when the tier came from the phone rule,
// which is unmeasured. Nothing here is a Roblox figure, and nothing names the deferred Unleashed
// mode. Until the first 300-frame report (and the first interval for the frame rate) the rows say
// they are measuring, so the block is never empty and never shows a figure it does not have.
export const MEASURING = 'measuring…';

const ms = (value) => (value == null || !Number.isFinite(value) ? '-' : `${value.toFixed(2)} ms`);
const fpsText = (fps) => (Number.isFinite(fps) && fps >= 0 ? `${fps} fps` : MEASURING);

function computedOn(status) {
	if (status.mode === 'workers') {
		return 'worker threads';
	}
	return status.fallbackReason ? `the main thread (${status.fallbackReason})` : 'the main thread';
}

function timingRows(report) {
	return [
		{ label: 'Writing the points', value: ms(report.writeMs) },
		{ label: 'Painting the maps', value: ms(report.paintMs) },
		{ label: 'Setting the glow', value: ms(report.strengthMs) },
		{ label: 'Drawing the frame', value: ms(report.renderMs) },
		{ label: "One layer's FFT, on its worker", value: ms(report.cascadeMs) },
	];
}

export function summarizeLive({ status, report, fps, paused = false }) {
	const phoneRule = status.tierReason === 'phone rule';
	const rows = [
		{ label: 'Frame rate', value: fpsText(fps) },
		{ label: 'Quality tier', value: phoneRule ? `${status.tier} (picked by the phone rule, unmeasured)` : status.tier },
		{ label: 'Surface points', value: status.vertices.toLocaleString('en-US') },
		{ label: 'Wave layers', value: Array.isArray(status.layers) ? String(status.layers.filter(Boolean).length) : '-' },
		{ label: 'Waves computed on', value: computedOn(status) },
	];
	if (paused) {
		rows.push({ label: 'Ocean', value: 'paused, so the waves and maps are held rather than recomputed' });
	}
	if (report) {
		rows.push(...timingRows(report));
	} else {
		rows.push({ label: 'Per-stage timings', value: MEASURING });
	}
	return { rows, phoneRule, measuring: !report };
}
