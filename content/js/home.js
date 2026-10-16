// Renders the home page's list of mini sites from projects.js. Hovering a tile plays its clip, where the
// device can hover and the reader hasn't asked for reduced motion.
import { PROJECTS } from './projects.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const canPlayClips = matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches;

export function formatDate(yyyyMm) {
  const [year, month] = yyyyMm.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function media(project, index) {
  const box = el('div', 'media');
  const img = el('img');
  img.src = `/img/previews/${project.slug}.jpg`;
  img.alt = '';
  img.width = 1280;
  img.height = 800;
  img.loading = index < 4 ? 'eager' : 'lazy';
  img.decoding = 'async';
  box.append(img);
  return box;
}

// The clip is only fetched on first hover.
function addClip(link, box, slug) {
  const video = el('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('aria-hidden', 'true');
  video.addEventListener('playing', () => video.classList.add('playing'));
  box.append(video);

  link.addEventListener('mouseenter', () => {
    if (!video.src) video.src = `/img/previews/${slug}.mp4`;
    video.play().catch(() => {}); // a missing clip just leaves the still showing
  });
  link.addEventListener('mouseleave', () => {
    video.pause();
    video.currentTime = 0;
    video.classList.remove('playing');
  });
}

function tile(project, index) {
  const link = el('a', 'tile');
  link.href = `/${project.slug}/`;
  const box = media(project, index);
  if (canPlayClips) addClip(link, box, project.slug);

  const title = el('h2', 'title', project.title);
  title.id = `${project.slug}-title`;
  link.setAttribute('aria-labelledby', title.id);
  const date = el('time', 'date', formatDate(project.date));
  date.dateTime = project.date;
  const head = el('div', 'head');
  head.append(title, date);

  const summary = el('p', 'summary', project.summary);
  if (project.status) summary.append(' ', el('span', 'status', `(${project.status.toLowerCase()})`));

  link.append(box, head, summary);
  const item = el('li');
  item.append(link);
  return item;
}

document.getElementById('projects').replaceChildren(...PROJECTS.map(tile));
document.getElementById('year').textContent = String(new Date().getFullYear());
