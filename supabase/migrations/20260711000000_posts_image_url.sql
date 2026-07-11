-- posts: optional public image URL for Threads image posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_url TEXT;

