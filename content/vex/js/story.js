import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Maps scroll position to chapters. Each chapter is a <section class="chapter"> holding one
// <div class="beat"> per beat. Exactly one chapter is set up at a time. Every beat element gets its
// own trigger, so the drawing always matches the text beside it: while beat k is in the middle of
// the screen, chapter.progress(k + local) runs with local going 0 → 1 as the beat passes.

gsap.registerPlugin(ScrollTrigger);

const BEAT_START = 'top 65%';
const BEAT_END = 'bottom 35%';

export function createStory(chapters, ctx, root = document) {
  let active = null;
  let lastProgress = new Map();

  function activate(chapter) {
    if (active === chapter) return;
    if (active) active.teardown();
    active = chapter;
    chapter.setup(ctx);
    chapter.progress(lastProgress.get(chapter) ?? 0);
  }

  const triggers = [];
  for (const chapter of chapters) {
    const section = root.querySelector(`#chapter-${chapter.id}`);
    if (!section) throw new Error(`Missing section #chapter-${chapter.id}`);
    const beats = [...section.querySelectorAll('.beat')];
    if (beats.length !== chapter.beats) {
      throw new Error(`Chapter ${chapter.id} declares ${chapter.beats} beats but has ${beats.length} .beat elements`);
    }
    triggers.push(ScrollTrigger.create({
      trigger: section,
      start: 'top 90%',
      end: 'bottom 10%',
      onToggle: (self) => { if (self.isActive) activate(chapter); },
    }));
    beats.forEach((beat, k) => {
      triggers.push(ScrollTrigger.create({
        trigger: beat,
        start: BEAT_START,
        end: BEAT_END,
        onUpdate: (self) => {
          const p = k + self.progress;
          lastProgress.set(chapter, p);
          if (active === chapter) chapter.progress(p);
        },
      }));
    });
  }

  if (!active && chapters.length > 0) activate(chapters[0]);

  return {
    active: () => active,
    refresh: () => ScrollTrigger.refresh(),
    destroy: () => { triggers.forEach((t) => t.kill()); if (active) active.teardown(); active = null; },
  };
}
