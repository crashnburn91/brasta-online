create index if not exists chat_reports_reporter_idx on public.chat_reports(reporter_id, created_at desc);
