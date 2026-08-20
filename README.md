# PRO4A RCD Document Tracker - Rebuilt

This build uses the exact official PRO4A RCD logo supplied for this project.

The logo file is used unchanged as:
- website header logo
- home-page logo
- favicon
- Apple touch icon
- PWA icon

Website API configuration is in `config.js`.

The website keeps the existing Apps Script API contract:
- dashboard
- getDocument
- getSections
- getPersonnel
- routeDocument

QR links open the website with `?id=CONTROL_REF_ID`.

Before deployment, make sure the Apps Script Web App is deployed and `config.js` contains its current `/exec` URL.
