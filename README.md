# PRO4A RCD Document Routing & Tracking System (Supabase Version)

High-performance cloud-backed document routing and tracking system for the **Philippine National Police - Police Regional Office 4A (PRO4A) Regional Comptrollership Division (RCD)**.

Deployed at: **https://rcd-document-tracker.vercel.app**

---

## What was Changed

- **Migrated from Google Sheets to Supabase**: Replaced the slow Google Apps Script backend with direct high-speed Supabase REST queries (~50-100ms response time).
- **Single Source of Truth**: All **INCOMING** and **OUTGOING** memorandum records are loaded directly from the `public.memos` table in Supabase project `insgdxhigsimnaauyhws`.
- **Movement History Logging**: Created `public.document_movements` in Supabase to track all Forward, Receive, and Complete movements, enabling full movement audit history and physical A4 Routing Slip printing.
- **100% Preserved UI Design**: Kept all existing user interfaces, QR code scanning, modal views, batch actions, and printable slip formats.
- **Added Memo Type Badges**: Latest memos and search results now show clear `[INCOMING]` and `[OUTGOING]` badges.

---

## Setup Instructions

### Step 1: Run the Database Setup in Supabase

1. Open your Supabase Project Dashboard:
   👉 **[warren020217's Project | SQL Editor](https://supabase.com/dashboard/project/insgdxhigsimnaauyhws/sql/new)**
2. Open the file [`supabase_setup.sql`](./supabase_setup.sql) located in this project folder.
3. Copy and paste the entire content of `supabase_setup.sql` into the Supabase SQL Editor and click **Run**.

This script:
- Creates the `document_movements` table for routing logs.
- Adds RLS policies so public tracker and QR code scans can query active memos without requiring a login gate.
- Enables recording document routing movements.

---

### Step 2: (Optional but Recommended) Add Service Role Key in Vercel

If you want the backend serverless API (`api/rcd.js`) to bypass RLS with administrative permissions:

1. In your Supabase Dashboard, go to **Project Settings** > **API**.
2. Copy your **`service_role` (secret)** key.
3. In your **Vercel Dashboard** under the `rcd-document-tracker` project:
   - Go to **Settings** > **Environment Variables**.
   - Add:
     - `SUPABASE_URL`: `https://insgdxhigsimnaauyhws.supabase.co`
     - `SUPABASE_SERVICE_ROLE_KEY`: `your_service_role_secret_key`
4. Redeploy the project in Vercel.

---

### Step 3: Deploy to GitHub / Vercel

Push the changes to your GitHub repository:
```bash
git add .
git commit -m "Migrate Document Tracker to Supabase database"
git push origin main
```
Vercel will automatically build and deploy the updated tracker.

---

## API Actions (`/api/rcd`)

- `action=dashboard`: Returns live counts (total documents, message center, forwarded, completed).
- `action=getDocuments`: Retrieves recent incoming and outgoing memos sorted newest-first.
- `action=getDocument&id=...`: Retrieves memo details and routing movement history.
- `action=routeDocument`: Records Forward, Receive, or Complete movements into Supabase.
- `action=getSections`: Returns the 9 PRO4A RCD sections.
- `action=getPersonnel`: Returns personnel for a selected section.
- `action=sync`: Confirms real-time Supabase connection.
