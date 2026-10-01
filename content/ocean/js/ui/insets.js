// The texture insets of steps 22, 23 and 25 (piece C2; lane F owns this file; spec 10.7). Task 0's
// version is the interface: the insets stay empty.
export function mountInsets({ handle, watchReading, onLayout = () => {} }) {
	return Object.freeze({ hooks: Object.freeze({ drawn: () => [] }) });
}
