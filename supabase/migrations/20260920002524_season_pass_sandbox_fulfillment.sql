-- Isolated sandbox fulfillment. Never writes real entitlements, inventory or XP.
alter table public.season_pass_checkout_tests
 add column payment_intent_id text unique,
 add column fulfillment_status text not null default 'none' check (fulfillment_status in ('none','active','refunded')),
 add column amount_refunded integer not null default 0 check (amount_refunded between 0 and amount_cents),
 add column test_reward_ids text[] not null default '{}';

create function public.brasta_fulfill_checkout_test(
 p_order_id uuid, p_session_id text, p_intent_id text, p_amount integer,
 p_currency text, p_refunded integer, p_livemode boolean
) returns void language plpgsql security invoker set search_path='' as $$
declare
 v_order public.season_pass_checkout_tests;
 v_rewards text[];
 v_refunded integer;
begin
 if p_livemode is distinct from false or p_intent_id is null or p_intent_id !~ '^pi_[A-Za-z0-9]+$'
 or p_refunded is null or p_refunded<0 or p_refunded>p_amount then raise exception 'Invalid sandbox payment'; end if;
 select * into strict v_order from public.season_pass_checkout_tests where order_id=p_order_id;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-test:'||v_order.player_id::text,0));
 select * into strict v_order from public.season_pass_checkout_tests where order_id=p_order_id for update;
 if v_order.payment_intent_id is not null and v_order.payment_intent_id<>p_intent_id then
  raise exception 'Payment intent does not match order';
 end if;
 -- Validates session, currency and amount, and records payment in the same transaction.
 perform public.brasta_update_checkout_test(p_order_id,p_session_id,'paid',p_amount,p_currency);
 v_refunded:=greatest(v_order.amount_refunded,p_refunded);
 -- Cumulative refunds never go backwards. Full refunds are terminal for this receipt.
 if v_order.fulfillment_status='refunded' or v_refunded=v_order.amount_cents then
  update public.season_pass_checkout_tests set payment_intent_id=p_intent_id,
   fulfillment_status='refunded',amount_refunded=v_refunded,test_reward_ids='{}',updated_at=now()
  where order_id=p_order_id;
  return;
 end if;
 select coalesce(array_agg(distinct reward_id order by reward_id),'{}'::text[]) into v_rewards from (
  select unnest(v_order.test_reward_ids) as reward_id
  union
  select r.reward_id from public.season_pass_rewards r
   join public.season_pass_seasons s on s.season_id=r.season_id
   left join public.season_pass_progress p on p.season_id=s.season_id and p.player_id=v_order.player_id
  where s.season_id=v_order.season_id and r.is_premium
   and r.tier<=least(s.tier_count,floor(coalesce(p.xp,0)::numeric/s.xp_per_tier)::integer)
 ) earned;
 update public.season_pass_checkout_tests set payment_intent_id=p_intent_id,
  fulfillment_status='active',amount_refunded=v_refunded,test_reward_ids=v_rewards,updated_at=now()
 where order_id=p_order_id;
end $$;
revoke all on function public.brasta_fulfill_checkout_test(uuid,text,text,integer,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.brasta_fulfill_checkout_test(uuid,text,text,integer,text,integer,boolean) to service_role;

create or replace function public.brasta_start_checkout_test(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.season_pass_checkout_tests; v_season public.season_pass_seasons;
begin
 perform pg_advisory_xact_lock(hashtextextended('checkout-test:'||p_player_id::text,0));
 if not exists(select 1 from private.season_pass_test_access where player_id=p_player_id and enabled) then
  raise exception 'Test access required';
 end if;
 select * into v_order from public.season_pass_checkout_tests where player_id=p_player_id and season_id='season_1' and status='paid' and fulfillment_status<>'refunded' limit 1;
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

notify pgrst,'reload schema';
