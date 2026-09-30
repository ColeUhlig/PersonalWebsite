// Module Web Worker entry point for the proof panel's Luau; the logic is in luauWorkerCore.js.
// Workers cannot use the page's import map, so the runtime comes from its full jsDelivr URL.
import { createLuauWorker } from './luauWorkerCore.js';
import { BUNDLE_URL, LUAU_WEB_URL } from '../proof/runtime.js';

async function loadSource() {
	const response = await fetch(BUNDLE_URL);
	if (!response.ok) {
		throw new Error(`the Luau bundle did not load (HTTP ${response.status})`);
	}
	return response.text();
}

const handle = createLuauWorker((message, transfer) => self.postMessage(message, transfer ?? []), {
	loadRuntime: () => import(LUAU_WEB_URL),
	loadSource,
});
self.onmessage = (event) => {
	handle(event.data);
};
