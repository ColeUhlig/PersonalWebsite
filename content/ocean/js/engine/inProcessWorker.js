// A Worker-shaped object that runs a worker core on this thread, delivering every message a
// microtask later so callers see the same asynchrony as a real Worker. It is the main-thread
// fallback when module workers are unavailable, and what the Node tests run the cores through.
// Transfer lists are accepted and ignored: nothing is detached, which a caller must not rely on.
export function createInProcessWorker(createCore) {
	const worker = {
		onmessage: null,
		onerror: null,
		terminated: false,
		postMessage(message) {
			if (worker.terminated) {
				return;
			}
			queueMicrotask(() => {
				if (worker.terminated) {
					return;
				}
				try {
					handle(message);
				} catch (error) {
					if (worker.onerror) {
						worker.onerror({ message: error.message, error });
					} else {
						throw error;
					}
				}
			});
		},
		terminate() {
			worker.terminated = true;
		},
	};
	const handle = createCore((reply) => {
		queueMicrotask(() => {
			if (!worker.terminated && worker.onmessage) {
				worker.onmessage({ data: reply });
			}
		});
	});
	return worker;
}
