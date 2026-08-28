# PRO4A RCD Document Routing System

Revised version of the PRO4A RCD Document Routing System.

## What was fixed

The original project had three different Google Apps Script Web App deployment URLs in different files. That could cause the website, synchronization script, and routing database to talk to different backend deployments.

The revised project uses the Web App URL defined in `apps-script/Code.gs` as the backend source of truth. `api/rcd.js` also allows an optional Vercel environment variable named `RCD_APPS_SCRIPT_URL`.

The synchronization logic was also changed so that:

- `PRO4A_RCD_Memo_Logbook_` remains the read-only source.
- New source records are added to `DOCUMENTS`.
- Existing source records are updated only in source columns A:M.
- Routing columns N:T are preserved.
- Old routing records are no longer automatically deleted when a source row disappears.
- Duplicate Control Ref IDs are not silently collapsed during synchronization.
- The website `Latest Memos` request can refresh the source before reading the latest records.
- The API now supports the `getDocuments` action required by the current frontend.
- Automatic synchronization can run from edits in the source Memo Logbook.
- A 5-minute scheduled synchronization remains as a safety net for imports, formulas, and other changes that do not trigger `onEdit`.

## Installation

### 1. Update the Google Apps Script

Open the Apps Script project attached to the **RCD DOCUMENT ROUTING DATABASE** spreadsheet.

Replace the existing `Code.gs` with:

`apps-script/Code.gs`

Save the project.

### 2. Update the Web App deployment

In Apps Script:

1. Deploy > Manage deployments.
2. Open the existing Web App deployment used by the project.
3. Create a new version from the updated code, or edit the existing deployment.
4. Keep the Web App access setting appropriate for your users.
5. Make sure the deployed URL matches the URL in `apps-script/Code.gs` under `CONFIG.WEB_APP_URL`.

If a new deployment URL is created, update both:

- `CONFIG.WEB_APP_URL` in `apps-script/Code.gs`
- `RCD_APPS_SCRIPT_URL` in Vercel

Do not leave the old deployment URL in `api/rcd.js`.

### 3. Install the automatic sync

In the **RCD DOCUMENT ROUTING DATABASE** spreadsheet, reload the sheet.

Use:

**RCD ROUTING > 4. Install Automatic Sync**

The revised installer creates:

- a source-spreadsheet edit trigger for near-real-time synchronization
- a 5-minute time-based backup trigger

The first installation may request authorization. Approve it using the account that has access to both spreadsheets.

### 4. Test manually

Use:

**RCD ROUTING > 2. Sync Existing Memo Logbook**

Then check the `DOCUMENTS` sheet.

After that, add a new record to the source `Memo Logbook` sheet. The target database should receive it automatically. The website Refresh button also requests a source synchronization before displaying the latest memos.

## Important

Do not run **RCD ROUTING > 1. Setup Database** on a production database unless you intentionally want to rebuild the database. That function clears and recreates the database sheets.

The revised synchronization function itself does not clear or rebuild the `DOCUMENTS` sheet.

## Backend actions

The Apps Script API supports:

- `dashboard`
- `getDocument`
- `getDocuments`
- `getSections`
- `getPersonnel`
- `routeDocument`
- `sync`

The existing frontend routing functions remain in place.
