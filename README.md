# CampusOS Map Editor

A production-ready Progressive Web App for designing indoor campus maps, including rooms, corridors, entrances, facilities, and connection paths.

## Features
- Drag, select, rotate, and resize map objects
- Pan and zoom the workspace
- Floor management and JSON import/export
- Local autosave with persistent browser storage
- Installable as an application on supported browsers and macOS
- Offline-first support through a service worker and cache shell

## Run locally
1. Open the project root in a local web server, for example:
   - `python -m http.server 8000`
   - or use VS Code Live Server
2. Visit `http://localhost:8000/`
3. Use the tools on the left to place items and the toolbar to pan, zoom, rotate, or fit the map.

## Deploy to GitHub Pages
1. Push the repository to GitHub.
2. In GitHub, open the repository settings.
3. Enable GitHub Pages and select the `GitHub Actions` deployment source.
4. The included workflow in `.github/workflows/deploy.yml` will publish the app automatically on pushes to `main`.

## Install as an app
1. Open the deployed app in a modern browser.
2. Look for the install button in the top-right toolbar.
3. Choose `Install CampusOS` to add the editor to your Applications or app launcher.

## Offline use
- The app caches its shell and static assets for repeat visits.
- Local map data stays stored in browser storage, so your project remains available offline after the first successful load.
- If the browser is offline, the app still loads the previously cached shell and keeps editing locally.

## Project structure
- `index.html` — app shell and install UI
- `app.js` — editor logic, PWA runtime setup, and install handling
- `style.css` — app styling and layout
- `manifest.webmanifest` — install metadata for browsers and desktop app support
- `service-worker.js` — cache-first offline shell
- `icons/` — app icons and PWA assets

## License
This project is licensed under the MIT License.
