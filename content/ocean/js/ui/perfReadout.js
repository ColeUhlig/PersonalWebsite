// The live numbers: frames per second measured here, the ocean's status, and its last report
// window (the Roblox report line's fields). Hidden unless ?stats=1.
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
					`write ${report.writeMs.toFixed(2)} ms  blend ${report.blendMs.toFixed(2)} ms (${report.blend.toFixed(2)})  paint ${report.paintMs.toFixed(2)} ms  upload ${report.uploadMs.toFixed(2)} ms  glow ${report.strengthMs.toFixed(2)} ms`,
					`workers: cascade ${report.cascadeMs.toFixed(2)} ms  colour ${report.colourMs.toFixed(2)} ms  foam ${report.foamMs.toFixed(2)} ms (cover ${report.foamCover.toFixed(3)})`,
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
