// Module Web Worker entry point for one cascade; the logic is in cascadeWorkerCore.js.
import { createCascadeWorker } from './cascadeWorkerCore.js';

const handle = createCascadeWorker((message, transfer) => self.postMessage(message, transfer ?? []));
self.onmessage = (event) => handle(event.data);
