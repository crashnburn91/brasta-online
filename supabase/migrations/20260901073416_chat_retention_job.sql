create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'brasta-chat-retention',
  '17 4 * * *',
  $$
    delete from public.chat_messages where expires_at < now();
    delete from public.chat_room_members where expires_at < now();
    delete from public.chat_safety_events where created_at < now() - interval '180 days';
  $$
)
where not exists (select 1 from cron.job where jobname = 'brasta-chat-retention');
