# Publishing server setup (one time, ~5 minutes)

`publish.gs` runs on Google Apps Script (free, uses your Google account). When someone taps
**Publish listing**, it saves the listing and photos to this GitHub repo in one commit.
GitHub then builds the site, and the listing is live ~2 minutes later.

## 1. Make a GitHub token (lets the script save to this repo only)

1. Open https://github.com/settings/personal-access-tokens/new
2. **Token name:** `sublet publishing`
3. **Expiration:** 1 year (put a reminder in your calendar to make a new one)
4. **Repository access:** *Only select repositories* → pick `meraryz/sublet`
5. **Permissions** → **Repository permissions** → **Contents** → *Read and write*
6. Click **Generate token** and copy it (it starts with `github_pat_`). Keep it secret.

## 2. Create the script

1. Open https://script.google.com and click **New project**
2. Click "Untitled project" at the top and rename it `Sublet publishing`
3. Delete everything in `Code.gs` and paste the whole content of `server/publish.gs`
4. Click 💾 **Save**

## 3. Give the script the token

1. Click ⚙️ **Project Settings** (left sidebar)
2. Scroll to **Script Properties** → **Add script property**
3. Property: `GITHUB_TOKEN`, Value: the token from step 1 → **Save script properties**

## 4. Check it works

1. Back in the **Editor** (`< >` in the sidebar), pick `testSetup` in the function dropdown at the top and click **Run**
2. Google asks for permission: **Review permissions** → choose your account →
   "Google hasn't verified this app" → **Advanced** → **Go to Sublet publishing (unsafe)** → **Allow**.
   (It's "unverified" only because you wrote it yourself.)
3. The log at the bottom should say: `Connected to meraryz/sublet. Can write: true`

## 5. Put it online

1. Click **Deploy** (top right) → **New deployment**
2. Click ⚙️ next to "Select type" → **Web app**
3. **Execute as:** *Me* · **Who has access:** *Anyone*
4. Click **Deploy** and copy the **Web app URL** (ends with `/exec`)
5. Put that URL in `create.html`: `const PUBLISH_URL = 'https://script.google.com/macros/s/.../exec';`
   then commit and push.

## Changing the script later

Edit the code, save, then **Deploy** → **Manage deployments** → ✏️ → **Version: New version** → **Deploy**.
The URL stays the same.

## Good to know

- Listings go live immediately, there's no approval. To remove one, delete it from `listings.json`
  (and its `photos/<id>/` folder) on GitHub and commit.
- Limits: 10 photos per listing (shrunk to ~300 KB each in the browser), 30 listings per hour in total.
- A hidden "trap" field catches simple spam bots: their posts are silently ignored.
- Testing `create.html` on your computer with `PUBLISH_URL` set publishes **for real**.
