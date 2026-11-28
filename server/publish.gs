// Sublet publishing server (Google Apps Script).
//
// create.html sends a new listing here. This script checks it, then saves it to the GitHub repo
// in one commit: the listing goes into listings.json and its photos into photos/<id>/.
// GitHub then builds and publishes the site (about 2 minutes).
//
// The admin view on the home page also comes here, to edit or delete a listing (with the admin password).
//
// Setup: see server/README.md. The GitHub token and the admin password live in this script's settings
// (Project Settings -> Script properties -> GITHUB_TOKEN, ADMIN_PASSWORD), never in the code.

const REPO = 'meraryz/sublet';
const BRANCH = 'main';
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;   // photos are shrunk in the browser first, so ~300 KB each
const MAX_POSTS_PER_HOUR = 30;             // simple protection against floods

// ---------- Entry points ----------

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    // Spam trap: people never see the "trap" field, bots fill it in. Pretend it worked.
    if (body.trap) return reply({ ok: true, id: '' });
    if (body.action) return reply(admin(body));

    const listing = clean(body.listing);
    const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, MAX_PHOTOS);
    rateLimit();

    // One listing at a time, so two people posting together don't overwrite each other.
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return reply({ ok: true, id: publish(listing, photos) });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return reply({ ok: false, error: err.userMessage || 'Something went wrong on our side. Please try again in a minute.' });
  }
}

// Opening the URL in a browser shows this, handy to check the deployment works.
function doGet() {
  return reply({ ok: true, service: 'sublet publishing' });
}

// Run this once from the editor (select testSetup, click Run) to check the token works.
function testSetup() {
  const repo = gh('GET', '');
  console.log(`Connected to ${repo.full_name}. Can write: ${repo.permissions && repo.permissions.push}`);
}

// ---------- Checking the listing ----------

function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
const list = (v, maxItems, max) => (Array.isArray(v) ? v : []).map(x => str(x, max || 80)).filter(Boolean).slice(0, maxItems || 30);
const amount = v => { const n = Number(v); return isFinite(n) && n > 0 && n < 10000000 ? Math.round(n) : undefined; };
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';

// Keep only the fields the site uses, with sane lengths. Whatever the browser sent,
// what gets saved can't break the site build.
function clean(l) {
  if (!l || typeof l !== 'object') throw userError('No listing received.');
  const price = l.price || {}, included = l.included || {}, contact = l.contact || {};
  const out = {
    id: '',
    title: str(l.title, 120),
    type: str(l.type, 40),
    address: str(l.address, 150),
    neighborhood: str(l.neighborhood, 60),
    from: day(l.from),
    to: day(l.to),
    price: {
      total: amount(price.total),
      perMonth: amount(price.perMonth),
      perNight: amount(price.perNight),
      billsIncluded: !!price.billsIncluded,
    },
    lookingFor: list(l.lookingFor),
    place: list(l.place),
    description: list(l.description, 10, 1500),
    included: { private: list(included.private), shared: list(included.shared) },
    notIncluded: list(l.notIncluded),
    nearby: list(l.nearby),
    contact: {
      name: str(contact.name, 60),
      phone: String(contact.phone || '').replace(/\D/g, '').slice(0, 15),
      messenger: String(contact.messenger || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 60),
    },
    photos: [],
  };
  if (!out.title || !out.neighborhood) throw userError('Please pick what you are renting out and the neighborhood.');
  if (!out.from || !out.to || out.to <= out.from) throw userError('Please check the dates.');
  if (!out.price.total) throw userError('Please add the price.');
  if (!out.contact.name) throw userError('Please add your name.');
  const { phone, messenger } = out.contact;
  if (phone && phone.length < 11) throw userError('Please check the WhatsApp number.');
  if (!phone && messenger.length < 3) throw userError('Please add a WhatsApp number or a Facebook username.');
  return out;
}

function rateLimit() {
  const cache = CacheService.getScriptCache();
  const key = 'posts-' + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(key) || 0);
  if (n >= MAX_POSTS_PER_HOUR) throw userError('Lots of listings are being posted right now. Please try again in an hour.');
  cache.put(key, String(n + 1), 3700);
}

// ---------- Admin: edit or delete a listing ----------

const MAX_WRONG_PASSWORDS_PER_HOUR = 20;

function checkPassword(password) {
  const cache = CacheService.getScriptCache();
  const key = 'wrong-' + Math.floor(Date.now() / 3600000);
  if (Number(cache.get(key) || 0) >= MAX_WRONG_PASSWORDS_PER_HOUR) throw userError('Too many wrong passwords. Try again in an hour.');
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real) throw userError('ADMIN_PASSWORD is not set in the script settings.');
  if (String(password || '') !== real) {
    cache.put(key, String(Number(cache.get(key) || 0) + 1), 3700);
    throw userError('Wrong password.');
  }
}

function admin(body) {
  checkPassword(body.password);
  const id = String(body.id || '');
  if (body.action === 'login') return { ok: true };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (body.action === 'update') {
      const changes = clean(body.listing);
      let saved;
      commit(head => {
        const listings = readListings(head);
        const i = listings.findIndex(l => l.id === id);
        if (i < 0) throw userError('This listing no longer exists.');
        // Everything can change except the id (its link) and the photos.
        saved = Object.assign({}, changes, { id, photos: listings[i].photos || [] });
        listings[i] = saved;
        return { message: `Edit listing: ${saved.title}`, tree: [listingsBlob(listings)] };
      });
      return { ok: true, listing: saved };
    }
    if (body.action === 'delete') {
      commit(head => {
        const listings = readListings(head);
        const entry = listings.find(l => l.id === id);
        if (!entry) throw userError('This listing no longer exists.');
        // Its photos folder goes too (a null sha deletes the file).
        const photos = photoFiles(id, head).map(path => ({ path, mode: '100644', type: 'blob', sha: null }));
        return { message: `Remove listing: ${entry.title}`, tree: [listingsBlob(listings.filter(l => l.id !== id)), ...photos] };
      });
      return { ok: true };
    }
    throw userError('Unknown action.');
  } finally {
    lock.releaseLock();
  }
}

function photoFiles(id, head) {
  if (!/^[a-z0-9-]+$/.test(id)) return [];
  try {
    return gh('GET', `/contents/photos/${id}?ref=${head}`).filter(f => f.type === 'file').map(f => f.path);
  } catch (err) {
    return [];   // no photos folder
  }
}

// ---------- Saving to GitHub ----------

function readListings(head) {
  const file = gh('GET', `/contents/listings.json?ref=${head}`);
  return JSON.parse(Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8'));
}

function listingsBlob(listings) {
  const json = JSON.stringify(listings, null, 2) + '\n';
  return { path: 'listings.json', mode: '100644', type: 'blob', sha: blob(Utilities.base64Encode(json, Utilities.Charset.UTF_8)) };
}

// Makes one commit. change(head) returns { message, tree }. Retries if someone else committed meanwhile.
function commit(change) {
  for (let attempt = 1; ; attempt++) {
    const head = gh('GET', `/git/ref/heads/${BRANCH}`).object.sha;
    const baseTree = gh('GET', `/git/commits/${head}`).tree.sha;
    const { message, tree } = change(head);
    const newTree = gh('POST', '/git/trees', { base_tree: baseTree, tree }).sha;
    const sha = gh('POST', '/git/commits', { message, tree: newTree, parents: [head] }).sha;
    try {
      gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha });
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      Utilities.sleep(1500);   // someone else committed first; start again from the new state
    }
  }
}

const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function uniqueId(listing, listings) {
  const base = slug(`${listing.neighborhood} ${listing.from}`) || 'listing';
  const taken = new Set(listings.map(l => l.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// Adds the listing and its photos in a single commit.
function publish(listing, photos) {
  let id;
  commit(head => {
    const listings = readListings(head);
    id = uniqueId(listing, listings);
    const entry = Object.assign({}, listing, { id });
    const tree = [];

    entry.photos = photos.map((p, i) => {
      const bytes = Utilities.base64Decode(String(p.data || '').replace(/^data:[^,]*,/, ''));
      if (bytes.length > MAX_PHOTO_BYTES) throw userError('One of the photos is too big.');
      if (!(bytes[0] === -1 && bytes[1] === -40)) throw userError('Photos must be JPEG.');   // JPEG files start with FF D8
      const path = `photos/${id}/${i + 1}.jpg`;
      tree.push({ path, mode: '100644', type: 'blob', sha: blob(Utilities.base64Encode(bytes)) });
      return { src: path, caption: str(p.caption, 60) };
    });

    listings.push(entry);
    tree.push(listingsBlob(listings));
    return { message: `Add listing: ${entry.title}`, tree };
  });
  return id;
}

function blob(base64) {
  return gh('POST', '/git/blobs', { content: base64, encoding: 'base64' }).sha;
}

function gh(method, path, body) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is missing in Script properties');
  const options = {
    method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${REPO}${path}`, options);
  const code = res.getResponseCode();
  if (code >= 300) throw new Error(`GitHub ${method} ${path} -> ${code}: ${res.getContentText().slice(0, 300)}`);
  return JSON.parse(res.getContentText());
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
