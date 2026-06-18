# Fleet Summary — Geotab Add-In

A simple MyGeotab custom page add-in that shows a live fleet overview:
- Stat cards: total vehicles, driving, idle, stopped/offline
- Vehicle table with live status, speed, and last-seen time
- Search filter by vehicle name or serial number
- "View on map" button per vehicle

---

## Files

```
fleet-summary-addin/
├── config.json   ← paste into MyGeotab to install
├── index.html    ← UI shell
├── main.js       ← all add-in logic
└── icon.svg      ← menu icon
```

---

## Installation (3 steps)

### Step 1 — Host the files

Upload all four files to any HTTPS server (GitHub Pages, Netlify, your own server).

> ⚠️ The URL path must **not** contain `-`, `@`, or `#` characters.
> e.g. `https://myserver.com/fleetaddin/index.html` ✅
> e.g. `https://my-server.com/fleet-addin/index.html` ❌

### Step 2 — Update config.json

Replace `https://YOUR-HOST/fleet-summary-addin/` with your actual hosted URL in `config.json`.

### Step 3 — Install in MyGeotab

1. Log in to MyGeotab
2. Go to **Administration → System → System Settings → Add-Ins**
3. Click **New Add-In**
4. Paste the contents of `config.json` into the configuration box
5. Click **OK** then **Save**
6. Refresh the page — **Fleet Summary** will appear in the left-hand menu under Activity

---

## How it works

The add-in uses a single `api.multiCall()` to batch two requests:

| API object | What it returns |
|---|---|
| `Device` | Vehicle names and serial numbers |
| `DeviceStatusInfo` | Live speed, driving state, last-seen timestamp |

Data is refreshed every time the user navigates to the page (`focus()`) or clicks the Refresh button. No data is written — this is a read-only dashboard.

---

## Customisation tips

**Change the menu position** — edit the `path` field in `config.json`:
```json
"path": "ActivityLink/"        // under Activity (default)
"path": "AdministrationLink/"  // under Administration
"path": "ActivityLink"         // at the top level, after Activity
```

**Change the vehicle limit** — edit `resultsLimit` in `main.js`:
```js
["Get", { typeName: "Device", resultsLimit: 500 }]
// increase for larger fleets
```

**Add more columns** — extend the `rowHTML()` function in `main.js` and add a `<th>` in `index.html`.
