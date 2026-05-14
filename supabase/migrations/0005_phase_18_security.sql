-- Phase 18: security hardening
-- Adds require_approval setting
-- Note: comment status is stored as plain text, no enum migration needed

insert into settings (key, value)
values ('require_approval', 'false')
on conflict (key) do nothing;
