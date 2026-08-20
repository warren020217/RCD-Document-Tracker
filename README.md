# PRO4A RCD Document Tracker - Final Connected Build

Website: https://rcd-document-tracker.vercel.app
Google Apps Script API: https://script.google.com/macros/s/AKfycbxUZtmJ7JHH6loEN2jXVZJBCbPcsDZFOq69nBinue33YjWZQ_NXE-Zo7D9CkLNILbJm_w/exec

IMPORTANT:
1. Replace the NEW spreadsheet's Code.gs with apps-script/Code.gs.
2. Save.
3. Run setupDatabase once only if the tabs need to be created/reset.
4. Run syncDocuments once with the optimized bulk-sync version.
5. Deploy the Apps Script as a Web App, execute as the owner, access for the intended users.
6. Redeploy the Vercel website with this entire package.

The old Memo Logbook is read-only for this routing system.
The QR code points to the website, not to the Apps Script endpoint.
The website uses JSONP for Apps Script browser communication.
