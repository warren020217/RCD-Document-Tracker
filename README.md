# PRO4A RCD Document Tracker - Simple Version

A separate, mobile-friendly and desktop-friendly frontend for the RCD document routing system.

## Included
- Home dashboard
- Track by Control Ref ID
- QR camera scanner
- Route / Receive
- Movement history
- Section-based personnel selection
- Existing Google Sheets backend compatibility

## Setup
1. Open the existing Google Sheet.
2. Back up the current Apps Script.
3. Install `apps-script/Code.gs`.
4. Run `setupRCDSystem()` once and authorize it.
5. Deploy the Apps Script as a Web App.
6. Copy the Web App URL.
7. Put it into `config.js`:
   `API_URL: "YOUR_WEB_APP_URL"`
8. Host the four website files: `index.html`, `styles.css`, `app.js`, `config.js`.

Do not activate the system for the whole office until an existing test record has been verified.
