# PRO4A RCD Document Routing System

Rebuilt frontend for the PRO4A Regional Comptrollership Division Document Routing System.

## Backend

The website is configured to use the confirmed working Google Apps Script Web App API:

`https://script.google.com/macros/s/AKfycbzHugvrj1wVLXJV_ov9iUoeC9JL9M55fXRpbVLIHauMHkd2lpUNgb6KqPHLE53-Ed93gg/exec`

The dashboard endpoint returns the current database metrics. The frontend displays those metrics directly.

## Supported API actions

The frontend supports:

- `dashboard`
- `getDocument`
- `getSections`
- `getPersonnel`
- `route`
- `receive`
- `complete`

For compatibility, it also falls back to the older `routeDocument` action when necessary.

## Deployment

Upload the contents of this project to the existing Vercel project. Make sure `config.js` is included in the deployment and is loaded before `app.js`.

The official PRO4A RCD logo in `assets/pro4a-logo.png` is retained.


## API connection fix
The website now calls `/api/rcd` on the same Vercel origin. That serverless
function proxies requests to the confirmed PRO4A RCD Apps Script deployment.
This avoids browser CORS/redirect problems when calling Apps Script directly.
