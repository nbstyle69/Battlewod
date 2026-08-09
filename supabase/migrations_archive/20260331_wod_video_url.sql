-- Add optional video_url column to box_wods
ALTER TABLE public.box_wods ADD COLUMN IF NOT EXISTS video_url text;
