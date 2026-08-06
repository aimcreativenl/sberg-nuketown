# src/settings/

Graphics/user settings system (`Settings.js`): presets, `localStorage` persistence,
and a safe `applyToGame()` that pokes known `Game`/renderer/particle fields if they
exist. Designed to never throw if a field is missing, so it's safe to wire in early.
