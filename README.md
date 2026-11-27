# sublet

A small site for sublet listings. Plain HTML, CSS and JavaScript: no frameworks, no npm install.

## Files

| File | What it does |
|---|---|
| `listings.json` | **All the listings.** Edit this to add, change or remove one |
| `index.html` | Home page: a card for every listing |
| `listing.html` | The listing page template (also works as `listing.html?id=old-north`) |
| `create.html` | Form for a new listing, with a live preview |
| `card.html` | The WhatsApp preview image design (1200×630) |
| `listing.js` | Shared code: loads `listings.json` and draws a listing |
| `style.css` | All styles |
| `photos/` | Listing photos. Put a new listing's photos in `photos/<listing-id>/` |
| `build.js` | Builds the site into `_site/` (see below) |

To change the design of every listing, edit `render()` in `listing.js` and/or `style.css`.

## WhatsApp previews

WhatsApp doesn't run JavaScript, so it only sees the `<meta>` tags written in the page.
`build.js` therefore makes, for every listing:

- `_site/<id>/index.html`, a page with that listing's preview tags. **This is the link to share:** `https://meraryz.github.io/sublet/<id>/`
- `_site/og/<id>-<fingerprint>.jpg`, a screenshot of `card.html?id=<id>`. The fingerprint changes whenever the listing,
  its cover photo or the card design changes, so WhatsApp never shows an old cached image.

GitHub runs `build.js` on every push (`.github/workflows/publish.yml`) and publishes `_site/`.
`_site/` is not committed.

## Run it on your computer

Needs Node and Google Chrome.

```sh
node build.js --serve
```

Then open http://localhost:8000. Run it again after you change something.

## Add a listing

1. Open `create.html`, fill in the form, and click **Create listing**.
2. Copy the data it gives you into `listings.json`.
3. Put the photos in `photos/<listing-id>/`.
4. Commit and push. GitHub builds and publishes it within a minute or two.
