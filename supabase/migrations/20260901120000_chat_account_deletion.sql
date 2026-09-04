alter table public.chat_messages
  drop constraint if exists chat_messages_sender_id_fkey;

alter table public.chat_messages
  add constraint chat_messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;
