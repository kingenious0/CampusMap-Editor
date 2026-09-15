# CampusOS Map Editor v7 — FINAL FIX

## Object placement
The editor now creates objects on `pointerup` during capture phase.
This intentionally avoids relying on browser click synthesis and avoids
SVG/canvas overlay hit-testing problems.

### Test
1. Open this folder's `index.html`.
2. Click `Room`.
3. Status changes to `✓ room tool active — release mouse on empty canvas to place`.
4. Press and release on an empty canvas area.
5. A Room appears.

### Diagnostic
Use `Test Room`. It calls the editor's public placement API directly and
should create a Room immediately. This distinguishes UI event problems from
rendering problems.

### Other features
- Smooth object dragging without full re-render per pointer move.
- Whole-canvas rotation Q/G.
- Pan with Space + drag or middle mouse.
- Zoom and Fit.
- Graph/Labels toggles.
- Undo/redo.
- JSON import/export.
- Local autosave.
- Offline/no external libraries.
