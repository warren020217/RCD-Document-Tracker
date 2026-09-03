-- =======================================================
-- PRO4A RCD DOCUMENT TRACKER - SUPABASE DATABASE SETUP
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/insgdxhigsimnaauyhws/sql/new
-- =======================================================

-- 1. Create document movements table for tracking routing history
CREATE TABLE IF NOT EXISTS public.document_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id UUID REFERENCES public.memos(id) ON DELETE CASCADE,
  control_ref_id TEXT NOT NULL,
  date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL, -- 'FORWARD', 'RECEIVE', 'COMPLETE'
  from_section TEXT,
  to_section TEXT,
  personnel TEXT,
  remarks TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for ultra-fast lookup by Control Ref ID
CREATE INDEX IF NOT EXISTS doc_movements_ref_idx 
  ON public.document_movements(control_ref_id, date_time DESC);

CREATE INDEX IF NOT EXISTS doc_movements_memo_id_idx 
  ON public.document_movements(memo_id, date_time DESC);

-- 2. Enable Row Level Security (RLS) on document_movements
ALTER TABLE public.document_movements ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for document_movements (Allow Tracker to read & log movements)
DROP POLICY IF EXISTS "doc_movements_select_policy" ON public.document_movements;
CREATE POLICY "doc_movements_select_policy" ON public.document_movements
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "doc_movements_insert_policy" ON public.document_movements;
CREATE POLICY "doc_movements_insert_policy" ON public.document_movements
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 4. RLS Policies for memos (Allow public tracking of incoming & outgoing memos)
DROP POLICY IF EXISTS "memos_select_public_tracking" ON public.memos;
CREATE POLICY "memos_select_public_tracking" ON public.memos
  FOR SELECT TO anon, authenticated
  USING (is_deleted = false);

-- Allow tracker routing updates (assign section, action officer, workflow status)
DROP POLICY IF EXISTS "memos_update_public_routing" ON public.memos;
CREATE POLICY "memos_update_public_routing" ON public.memos
  FOR UPDATE TO anon, authenticated
  USING (is_deleted = false)
  WITH CHECK (is_deleted = false);

-- 5. Grant access permissions to anon and authenticated roles
GRANT SELECT, UPDATE ON public.memos TO anon, authenticated;
GRANT ALL ON public.document_movements TO anon, authenticated;

-- Confirmation check
SELECT 
  'Setup completed successfully!' AS status,
  (SELECT count(*) FROM public.memos WHERE is_deleted = false) AS total_active_memos,
  (SELECT count(*) FROM public.document_movements) AS total_movement_records;
