-- Test receipts only. No trigger or function grants real Premium/XP/rewards.
create table public.season_pass_checkout_tests (
 order_id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.profiles(id) on delete cascade,
 season_id text not null references public.season_pass_seasons(season_id),
 amount_cents integer not null check(amount_cents>0),
 currency text not null,
 checkout_session_id text unique,
 status text not null default 'created' check(status in ('created','open','paid','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 hour',
 updated_at timestamptz not null default now()
);
alter table public.season_pass_checkout_tests enable row level security;
revoke all on public.season_pass_checkout_tests from public,anon,authenticated;
grant select,insert,update on public.season_pass_checkout_tests to service_role;
create index on public.season_pass_checkout_tests(player_id,created_at desc);

create function public.brasta_start_checkout_test(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.season_pass_checkout_tests; v_season public.season_pass_seasons;
begin
 perform pg_advisory_xact_lock(hashtextextended('checkout-test:'||p_player_id::text,0));
 if not exists(select 1 from private.season_pass_test_access where player_id=p_player_id and enabled) then
  raise exception 'Test access required';
 end if;
 select * into v_order from public.season_pass_checkout_tests where player_id=p_player_id and season_id='season_1' and status='paid' limit 1;
 if found then return to_jsonb(v_order); end if;
 update public.season_pass_checkout_tests set status='expired',updated_at=now() where player_id=p_player_id and
 ((status='open' and expires_at<=now()) or (status='created' and expires_at<now()+interval '31 minutes'));
 select * into v_order from public.season_pass_checkout_tests where player_id=p_player_id and season_id='season_1' and status in ('created','open') order by created_at desc limit 1;
 if found then return to_jsonb(v_order); end if;
 select * into strict v_season from public.season_pass_seasons where season_id='season_1';
 insert into public.season_pass_checkout_tests(player_id,season_id,amount_cents,currency)
 values(p_player_id,'season_1',v_season.price_cents,lower(v_season.currency)) returning * into v_order;
 return to_jsonb(v_order);
end $$;
create function public.brasta_update_checkout_test(p_order_id uuid,p_session_id text,p_status text,p_amount integer,p_currency text)
returns void language plpgsql security definer set search_path='' as $$
declare v_order public.season_pass_checkout_tests;
begin
 select * into strict v_order from public.season_pass_checkout_tests where order_id=p_order_id for update;
 if p_session_id is null or p_session_id not like 'cs_test_%' or p_status is null or p_status not in ('open','paid','expired')
 or p_amount is distinct from v_order.amount_cents or p_currency is distinct from v_order.currency
 or (v_order.checkout_session_id is not null and v_order.checkout_session_id<>p_session_id) then raise exception 'Invalid checkout receipt'; end if;
 -- A delayed expiration/unpaid event cannot erase a verified paid receipt.
 if v_order.status='paid' then return; end if;
 if v_order.status='expired' and p_status='open' then return; end if;
 update public.season_pass_checkout_tests set checkout_session_id=p_session_id,status=p_status,updated_at=now() where order_id=p_order_id;
end $$;
revoke all on function public.brasta_start_checkout_test(uuid) from public,anon,authenticated;
revoke all on function public.brasta_update_checkout_test(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.brasta_start_checkout_test(uuid) to service_role;
grant execute on function public.brasta_update_checkout_test(uuid,text,text,integer,text) to service_role;
notify pgrst,'reload schema';
