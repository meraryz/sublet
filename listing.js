// Shared code for all pages: load the listings, draw one listing, small helpers.
// Every page includes this file and uses it as `Sublet.something(...)`.
const Sublet = (() => {

  // ---- Loading data ----
  // All listings live in listings.json. To move to a real database later,
  // only this function needs to change.
  async function loadListings() {
    const res = await fetch('listings.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load listings.json');
    return res.json();
  }

  // Shown when loading fails. The usual cause is opening the file directly
  // (file://) instead of through a local server.
  function loadError(el) {
    el.innerHTML = `<p class="msg">Couldn't load the listings.<br>
      If you opened this file directly, run <code>python3 -m http.server</code>
      in the project folder and open <a href="http://localhost:8000">localhost:8000</a>.</p>`;
  }

  // ---- Formatting helpers ----
  // esc() makes text safe to put inside HTML (typed text can't break the page).
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₪' + Number(n).toLocaleString('en-US');
  const date = iso => iso ? iso.split('-').reverse().join('/') : '';   // 2027-03-01 -> 01/03/2027
  const dates = l => `${date(l.from)} – ${date(l.to)}`;
  const firstName = name => String(name || '').trim().split(' ')[0];
  const chips = (items, cls = '') => (items || []).map(t => `<span class="chip ${cls}">${esc(t)}</span>`).join('');
  const list = items => items.map(t => `<li>${esc(t)}</li>`).join('');

  function whatsappLink(l) {
    const text = `Hi, I saw your listing in ${l.neighborhood} for ${dates(l)}`;
    const phone = String(l.contact?.phone || '').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  // Check / cross icons used by the price card and the included sections.
  const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="nope" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></symbol>
  </defs></svg>`;

  // ---- Drawing one listing ----
  // Takes a listing object (one entry of listings.json) and returns the page HTML.
  // options.back: show the "All listings" link. options.preview: used on the create page.
  function render(l, options = {}) {
    const photos = l.photos?.length ? l.photos : [{ src: 'photos/building.svg', caption: '' }];
    const price = l.price || {};
    const bills = !!price.billsIncluded;
    const priv = l.included?.private || [];
    const shared = l.included?.shared || [];
    const cols = [['Private', priv], ['Shared', shared]].filter(c => c[1].length);
    const notIncluded = l.notIncluded || [];

    const slides = photos.map(p => `
      <div class="slide"><img src="${esc(p.src)}" alt="${esc(p.caption || 'Photo')}">
        ${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}</div>`).join('');

    const rates = [
      price.perMonth ? `${money(price.perMonth)} per month` : '',
      price.perNight ? `${money(price.perNight)} per night` : '',
    ].filter(Boolean).map(r => `<span>${r}</span>`).join(' · ');

    return `${ICONS}
    <div class="wrap">
      <div class="hero">
        <div class="gal" tabindex="0" aria-label="Photo gallery, swipe for more photos">${slides}</div>
        ${options.back ? `<a class="back" href="./">← All listings</a>` : ''}
        <span class="count"></span>
        <div class="dots" aria-hidden="true"></div>
      </div>

      <div class="body">
        <div class="head">
          <h1>${esc(l.title) || 'Untitled listing'}</h1>
          <div class="info">
            <p class="meta">
              ${l.address ? `<span>📍 ${esc(l.address)}</span>` : ''}
              ${l.from || l.to ? `<strong>📅 ${dates(l)}</strong>` : ''}
            </p>
            ${l.lookingFor?.length ? `<div><h3 class="gl">Looking for</h3><div class="cl">${chips(l.lookingFor)}</div></div>` : ''}
            <div><h3 class="gl">The place</h3><div class="cl">${l.type ? chips([l.type], 'dark') : ''}${chips(l.place)}</div></div>
            ${l.contact?.name ? `<p class="contact">👤 ${esc(l.contact.name)}<span class="sr"> (contact person)</span></p>` : ''}
          </div>
          <div class="side">
            <div class="fact">
              <span>Total price</span>
              <strong>${price.total ? money(price.total) : '—'}</strong>
              ${rates ? `<small>${rates}</small>` : ''}
              <small class="incl ${bills ? 'yes' : 'no'}"><svg aria-hidden="true"><use href="#${bills ? 'ok' : 'nope'}"/></svg>Bills ${bills ? 'included' : 'not included'}</small>
            </div>
          </div>
        </div>

        ${l.description?.length ? `<div class="desc">${l.description.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}

        <div class="zones">
          ${cols.length ? `
          <section class="inc">
            <h3><svg aria-hidden="true"><use href="#ok"/></svg> Included</h3>
            <div class="cols ${cols.length === 1 ? 'one' : ''}">
              ${cols.map(([name, items]) => `<div class="col"><h4>${name}</h4><ul>${list(items)}</ul></div>`).join('')}
            </div>
          </section>` : ''}
          ${notIncluded.length ? `
          <section class="out">
            <h3><svg aria-hidden="true"><use href="#nope"/></svg> Not included</h3>
            <ul>${list(notIncluded)}</ul>
          </section>` : ''}
        </div>
      </div>

      <div class="bar">
        <div>
          <a class="btn main" href="${whatsappLink(l)}" target="_blank" rel="noopener">Message ${esc(firstName(l.contact?.name)) || 'host'} on WhatsApp</a>
          <button class="btn alt share" type="button">Share</button>
        </div>
      </div>
    </div>
    <div class="toast" role="status"></div>`;
  }

  // ---- Making a drawn listing interactive (gallery + share button) ----
  function activate(root, options = {}) {
    const toast = root.querySelector('.toast');
    const say = text => {
      toast.textContent = text;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    };

    root.querySelector('.share').addEventListener('click', async () => {
      if (options.preview) return say('Sharing works on the real listing page');
      const url = options.shareUrl || location.href;
      try {
        if (navigator.share) return await navigator.share({ title: document.title, url });  // phone share sheet
        await navigator.clipboard.writeText(url);
        say('Link copied');
      } catch (e) {
        if (e.name !== 'AbortError') say('Copy the link from the address bar');
      }
    });

    const gal = root.querySelector('.gal');
    const dots = root.querySelector('.dots');
    const count = root.querySelector('.count');
    const n = gal.children.length;
    dots.innerHTML = '<i></i>'.repeat(n);
    function sync() {
      const i = Math.min(n - 1, Math.max(0, Math.round(gal.scrollLeft / gal.clientWidth)));
      [...dots.children].forEach((d, j) => d.className = j === i ? 'on' : '');
      count.textContent = `${i + 1} / ${n}`;
    }
    gal.addEventListener('scroll', () => requestAnimationFrame(sync));
    gal.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') gal.scrollBy({ left: gal.clientWidth, behavior: 'smooth' });
      if (e.key === 'ArrowLeft') gal.scrollBy({ left: -gal.clientWidth, behavior: 'smooth' });
    });
    sync();
  }

  return { loadListings, loadError, render, activate, esc, money, dates };
})();
