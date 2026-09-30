// The live numbers: frames per second measured here, the ocean's status, and its last report
// window (the Roblox report line's fields). Hidden unless ?stats=1. `copy` is the report's uploadMs:
// the CPU copy of the painters' pixels into the texture arrays, not the GPU upload, which falls
// inside `render` (the page's view.render()).
const ms = (value) => (value == null ? '-' : `${value.toFixed(2)} ms`);

export function createPerfReadout(element) {
	const times = [];
	let lastText = '';
	return {
		frame(nowMs) {
			times.push(nowMs);
			while (times.length > 0 && nowMs - times[0] > 1000) times.shift();
		},
		show(status, report) {
			const fps = times.length;
			const lines = [
				`fps ${fps}  frame ${status.frame}  tier ${status.tier}  vertices ${status.vertices}`,
				`${status.mode === 'workers' ? 'workers' : `main thread (${status.fallbackReason})`}  cascades ready ${status.workersReady}  painter ${status.painterReady ? 'ready' : 'starting'}`,
			];
			if (report) {
				lines.push(
					`write ${ms(report.writeMs)}  blend ${ms(report.blendMs)} (${report.blend == null ? 'off' : report.blend.toFixed(2)})  paint ${ms(report.paintMs)}  copy ${ms(report.uploadMs)}  glow ${ms(report.strengthMs)}  render ${ms(report.renderMs)}`,
					`workers: cascade ${ms(report.cascadeMs)}  colour ${ms(report.colourMs)}  foam ${ms(report.foamMs)} (cover ${report.foamCover.toFixed(3)})`,
				);
			}
			const text = lines.join('\n');
			if (text !== lastText) {
				element.textContent = text;
				lastText = text;
			}
		},
	};
}
