// Every mini site the home page lists, newest first. `status` is optional, e.g. 'In progress'.
// To add one: put its folder in content/<slug>/, add an entry here, then run
// `node scripts/capture-previews.mjs <slug>` to take its preview image.
export const PROJECTS = [
  {
    slug: 'farmerdrop',
    title: 'Following ten dollars',
    summary:
      'How I built Farmerdrop’s payment system: where every cent and the crate are at each moment, and what happens when Stripe, the network or the server fails.',
    date: '2026-10',
    status: 'In progress',
  },
  {
    slug: 'kalshi',
    title: 'Containing the Optimizer',
    summary:
      'augur, a multi-agent LLM system for strategy discovery in Kalshi’s 15-minute Bitcoin contracts: adversarial containment, a point-in-time audit and injection–recovery calibration.',
    date: '2026-10',
  },
  {
    slug: 'ocean',
    title: 'Building an Ocean in Roblox',
    summary:
      'A real-time FFT ocean for Roblox, built up step by step from a single sinusoid, with a JavaScript port running live in the browser.',
    date: '2026-09',
  },
  {
    slug: 'vex',
    title: 'How a VEX robot knows where it is',
    summary:
      'Odometry from three tracking wheels and a gyro: how each encoder tick becomes a position on the field, with a robot you can drive yourself.',
    date: '2026-09',
  },
];
