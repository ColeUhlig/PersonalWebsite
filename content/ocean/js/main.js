// Page boot: read the config, check WebGL, and start the ocean (Task 6 adds the ocean itself).
import { readConfig } from './engine/config.js';

export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
	} catch {
		return false;
	}
}

function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}

const config = readConfig(location.search);
for (const warning of config.warnings) {
	console.warn(`[ocean] ${warning}`);
}
if (!webglSupported()) {
	showNotice('This live ocean needs WebGL, which this browser has turned off or does not support.');
}
