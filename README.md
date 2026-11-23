# Dayfold v0.1 — private, offline activity journal

Dayfold is a small Progressive Web App (PWA) for manually recording activities and analyzing time. **No journal data is sent to a server.** The app does not use accounts, external libraries, analytics, or advertising. Records are stored in the device browser's IndexedDB database. The app can be opened offline after it has been installed and its files cached.

## Install on your Android phone (one-time internet connection required)

1. Download `dayfold-install.zip` from the ChatGPT conversation. **Do not unzip it** if the hosting service accepts ZIP files.
2. Use a static HTTPS hosting service. An easy option is [Netlify Drop](https://app.netlify.com/drop/), which accepts a ZIP archive. Upload `dayfold-install.zip`. You can do this from a phone browser if its file-upload picker works, or from a computer.
3. **Claim or retain the site under your own hosting account** if you intend to keep it. An anonymous temporary deployment is not a reliable permanent address. You do **not** create any account *inside Dayfold*.
4. Open the resulting **HTTPS site URL** in Chrome on Android. Confirm that the Dayfold Journal screen appears. While connected, let the page finish loading so the service worker can cache its files.
5. Use Chrome's menu **⋮ → Install app** (or **Add to Home screen**). Once installed, open Dayfold from its home-screen icon.
6. To verify offline use, switch your phone to airplane mode and open Dayfold. Activities and statistics should still work.

The exact menu wording can vary with the Chrome version. If Chrome gives you a shortcut rather than the full install, the site can still work offline once the service worker has successfully cached it; install behavior may vary by browser.

### Important: URL and storage

**Keep using the same website address.** IndexedDB storage is tied to the URL's origin (scheme, hostname, and port), not to the ZIP file. Deploying a new copy at a different address will create a new empty database there. To move data, export a complete JSON backup from Settings, open the new site, and restore that backup.

Clearing Chrome's site storage, removing the browser profile, or uninstalling the web app can delete its local data. **Export and safely store the complete JSON backup periodically.** CSV is for analysis and is **not** a full-fidelity restoration file.

Netlify (or whichever host you choose) hosts the *program files*. Those files may be publicly accessible depending on host settings, but Dayfold does not upload activity records, notes, labels, or backups to it. Your browser may contact the host to obtain/update the program itself when online.

## What's included

- Manually add/edit/delete activities at arbitrary starting and ending times; no running timer.
- Chronological journal, date picker, search across past records, and visible gaps, with no invented data for missing periods.
- Activity overlap prevention, including intervals spanning midnight.
- Two-level custom colored primary labels. A parent label can be used directly when the sublabel isn't known.
- Optional notes and secondary tags (e.g. Music or YouTube), counted without adding duplicate recorded hours. A tag applies to its **entire** interval.
- Pie/donut charts and stacked hourly histograms; day/week/month/year/all/custom periods.
- Configurable denominators: shown categories (default), focused activity, all recorded time, or elapsed clock time.
- Hide/reinclude categories in a chart, focus on a single label or its sublabels, filter by secondary tag.
- Five editable time-of-day periods, including periods crossing midnight; filters split recorded time automatically.
- Rename/archive labels and tags without destroying old records. Delete only unused labels/tags.
- Full JSON backup/restore; CSV export including UTC and local timestamps.

Not included in v0.1: arbitrary noncontiguous date-range selections, automatic reminders or timers, synchronization across devices, partial-duration tags, automatic backups, or data sent to remote services.

## Development and updates

This is a plain HTML/CSS/JavaScript static website. It does not require npm, a bundler, a build server, or a backend. Any HTTPS static host can serve these files. For development on a computer:

```bash
cd dayfold-app
python -m http.server 8765
# Open http://localhost:8765 in a browser
```

When distributing an update, preserve the **same hosting origin** and update the service worker's cache version in `sw.js` (currently `dayfold-shell-v1`). The app uses a versioned internal database called `dayfold-private-v1`; avoid changing this key unless a migration is implemented. Take a JSON backup before updating.

`tests/test_logic.cjs` can be executed with Node.js (without dependencies):

```bash
TZ=Europe/Berlin node tests/test_logic.cjs
```

**Testing status:** JavaScript parsing and core statistical tests were checked in the build environment, but a full Android-device test and browser end-to-end interaction test have **not** been performed. Treat this as an initial release; take an early backup before relying on it for long-term records.

## Version 0.2 — dark mode and navigation

Dark mode is the default. On small screens, the bottom navigation is raised above the Powered by Netlify badge, so Labels and Settings remain reachable. You can also dismiss the badge by tapping it and choosing **Hide this badge**.

To upgrade a deployed copy, **upload the updated ZIP to the same Netlify project**, not a new project. The app uses the same origin and IndexedDB, so existing records should remain intact. Export a JSON backup before every update, and reload the app online after deploying to refresh its offline cache.
