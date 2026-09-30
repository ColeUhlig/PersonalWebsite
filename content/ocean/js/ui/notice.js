// Shows one of the page's notices (page/notices.js) in the #notice strip (piece C).
export function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}
