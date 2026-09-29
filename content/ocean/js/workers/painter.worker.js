// Module Web Worker entry point for one painter role; the logic is in painterWorkerCore.js.
import { createPainterWorker } from './painterWorkerCore.js';

const handle = createPainterWorker((message, transfer) => self.postMessage(message, transfer ?? []));
self.onmessage = (event) => handle(event.data);
