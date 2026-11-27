// Builds the site into _site/ so every listing gets a perfect WhatsApp preview.
//
// WhatsApp doesn't run JavaScript: it only reads the <meta> tags of the page you share.
// So for every listing in listings.json this script makes:
//   _site/<id>/index.html  the listing page, with that listing's title, description and image
//   _site/og/<id>.jpg      the 1200x630 preview image (a screenshot of card.html?id=<id>)
//
// Usage:
//   node build.js          build into _site/
//   node build.js --serve  build, then open the site at http://localhost:8000
//
// Needs only Node and Google Chrome. No npm install.

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const run = require('util').promisify(execFile);

const SITE_URL = 'https://meraryz.github.io/sublet/';   // where the site is published (ends with /)
const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const SKIP = new Set(['_site', '.git', '.github', 'build.js', 'README.md', 'preview.png', '.DS_Store', '.gitignore']);

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '₪' + Number(n).toLocaleString('en-US');
const date = iso => iso.split('-').reverse().join('/');
const hash = data => crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 8);

function findChrome() {
  const options = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const found = options.find(p => p && fs.existsSync(p));
  if (!found) throw new Error('Google Chrome not found. Set CHROME=/path/to/chrome');
  return found;
}

// A tiny web server for _site/ (Chrome needs one to load listings.json).
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function serve(port) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let file = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(OUT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, () => resolve(server));
  });
}

// The text WhatsApp shows under the image.
function description(l) {
  const p = l.price;
  const rate = p.perNight ? ` (${money(p.perNight)}/night)` : p.perMonth ? ` (${money(p.perMonth)}/month)` : '';
  return [
    `${date(l.from)} – ${date(l.to)}`,
    `${money(p.total)} total${rate}`,
    l.type,
    l.neighborhood,
    p.billsIncluded ? 'Bills included' : null,
  ].filter(Boolean).join(' · ');
}

function previewTags({ title, desc, url, image, alt }) {
  return [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Sublet">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:secure_url" content="${esc(image)}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="canonical" href="${esc(url)}">`,
  ].join('\n');
}

// ---------- build ----------
async function build() {
  const listings = JSON.parse(fs.readFileSync(path.join(ROOT, 'listings.json'), 'utf8'));
  const template = fs.readFileSync(path.join(ROOT, 'listing.html'), 'utf8');
  if (!template.includes('<!-- BUILD:HEAD')) throw new Error('listing.html is missing the <!-- BUILD:HEAD --> marker');

  // 1. Copy the site into _site/ (keeping old preview images, so unchanged ones aren't re-made).
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(OUT)) if (name !== 'og') fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  for (const name of fs.readdirSync(ROOT)) {
    if (!SKIP.has(name)) fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
  }
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');   // tells GitHub Pages to serve files as they are
  fs.mkdirSync(path.join(OUT, 'og'), { recursive: true });

  // 2. A page per listing, with its own preview tags.
  // Image file names include a fingerprint of the listing, so when a listing changes
  // the image gets a new URL and WhatsApp can't show an old cached one.
  const shots = [];
  const ids = new Set();
  // What the image depends on: the card design, the listing's data and its cover photo file.
  const card = fs.readFileSync(path.join(ROOT, 'card.html'), 'utf8');
  const fileBytes = src => { try { return fs.readFileSync(path.join(ROOT, src)).toString('base64'); } catch (e) { return ''; } };
  for (const l of listings) {
    if (!/^[a-z0-9-]+$/.test(l.id)) throw new Error(`Listing id "${l.id}" must use only a-z, 0-9 and -`);
    if (ids.has(l.id)) throw new Error(`Two listings have the id "${l.id}"`);
    ids.add(l.id);

    const image = `og/${l.id}-${hash([card, l, fileBytes(l.photos?.[0]?.src || '')])}.jpg`;
    shots.push({ page: `card.html?id=${l.id}`, file: image });

    const head = `<base href="../">\n` + previewTags({
      title: l.title,
      desc: description(l),
      url: `${SITE_URL}${l.id}/`,
      image: SITE_URL + image,
      alt: `${l.title}, ${l.neighborhood}`,
    }) + `\n<script>window.LISTING_ID = ${JSON.stringify(l.id)};</script>`;

    const html = template
      .replace(/<!-- BUILD:HEAD[^>]*-->/, head)
      .replace(/<title>.*?<\/title>/, `<title>${esc(l.title)} · ${date(l.from)}–${date(l.to)}</title>`);
    fs.mkdirSync(path.join(OUT, l.id), { recursive: true });
    fs.writeFileSync(path.join(OUT, l.id, 'index.html'), html);
  }

  // Home page image (changes when listings change).
  const homeImage = `og/home-${hash([card, listings.length])}.jpg`;
  shots.push({ page: 'card.html', file: homeImage });
  const indexFile = path.join(OUT, 'index.html');
  fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace(SITE_URL + 'og/home.jpg', SITE_URL + homeImage));

  // 3. Take the screenshots that don't exist yet; delete images no longer used.
  const keep = new Set(shots.map(s => path.basename(s.file)));
  for (const name of fs.readdirSync(path.join(OUT, 'og'))) if (!keep.has(name)) fs.rmSync(path.join(OUT, 'og', name));

  const todo = shots.filter(s => !fs.existsSync(path.join(OUT, s.file)));
  if (todo.length) {
    const chrome = findChrome();
    const server = await serve(0);
    const port = server.address().port;
    try {
      for (const s of todo) {
        // Async, so our little server can answer Chrome's requests meanwhile.
        await run(chrome, [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
          '--window-size=1200,630', '--virtual-time-budget=8000',
          `--screenshot=${path.join(OUT, s.file)}`, `http://localhost:${port}/${s.page}`,
        ], { timeout: 60000 });
        const kb = Math.round(fs.statSync(path.join(OUT, s.file)).size / 1024);
        console.log(`  image  ${s.file}  ${kb} KB${kb > 300 ? '  ⚠ over 300 KB, WhatsApp may not show it' : ''}`);
      }
    } finally {
      server.close();
    }
  }

  console.log(`Built ${listings.length} listings into _site/ (${todo.length} new preview images)`);
}

build().then(async () => {
  if (process.argv.includes('--serve')) {
    await serve(8000);
    console.log('Open http://localhost:8000  (Ctrl+C to stop)');
  }
}).catch(err => { console.error('Build failed:', err.message); process.exit(1); });
