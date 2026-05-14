-- Phase 18: security hardening
-- Adds held status, require_approval setting

-- Add held to the comment_status enum
alter type comment_status add value if not exists 'held';

-- Add require_approval to settings (default off)
insert into settings (key, value)
values ('require_approval', 'false')
on conflict (key) do nothing;
