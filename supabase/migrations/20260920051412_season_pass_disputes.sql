alter table public.season_pass_checkout_tests
 drop constraint season_pass_checkout_tests_fulfillment_status_check,
 add constraint season_pass_checkout_tests_fulfillment_status_check check(fulfillment_status in ('none','active','refunded','disputed','revoked')),
 add column dispute_id text,
 add column dispute_state text not null default 'none' check(dispute_state in ('none','open','won','lost'));

create or replace function public.brasta_fulfill_checkout_test(
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
 if v_order.dispute_state in ('open','lost') then
  update public.season_pass_checkout_tests set payment_intent_id=p_intent_id,
   fulfillment_status=case when v_order.dispute_state='lost' then 'revoked' else 'disputed' end,
   amount_refunded=v_refunded,test_reward_ids='{}',updated_at=now() where order_id=p_order_id;
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

create function public.brasta_reconcile_checkout_test(
 p_order_id uuid,p_session_id text,p_intent_id text,p_amount integer,p_currency text,
 p_refunded integer,p_livemode boolean,p_dispute_id text,p_dispute_state text
) returns void language plpgsql security invoker set search_path='' as $$
declare v_order public.season_pass_checkout_tests;
begin
 if p_dispute_state is null or p_dispute_state not in ('none','open','won','lost')
 or (p_dispute_state='none' and p_dispute_id is not null)
 or (p_dispute_state<>'none' and (p_dispute_id is null or p_dispute_id !~ '^du_[A-Za-z0-9]+$')) then
  raise exception 'Invalid dispute';
 end if;
 select * into strict v_order from public.season_pass_checkout_tests where order_id=p_order_id;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-test:'||v_order.player_id::text,0));
 select * into strict v_order from public.season_pass_checkout_tests where order_id=p_order_id for update;
 if v_order.dispute_id is not null and p_dispute_id is not null and v_order.dispute_id<>p_dispute_id then
  raise exception 'Different dispute requires review';
 end if;
 -- No-dispute and open snapshots cannot overwrite terminal provider outcomes.
 update public.season_pass_checkout_tests set dispute_id=coalesce(dispute_id,p_dispute_id),
  dispute_state=case when dispute_state in ('won','lost') or p_dispute_state='none' then dispute_state else p_dispute_state end
 where order_id=p_order_id;
 perform public.brasta_fulfill_checkout_test(p_order_id,p_session_id,p_intent_id,p_amount,p_currency,p_refunded,p_livemode);
end $$;
revoke all on function public.brasta_reconcile_checkout_test(uuid,text,text,integer,text,integer,boolean,text,text) from public,anon,authenticated;
grant execute on function public.brasta_reconcile_checkout_test(uuid,text,text,integer,text,integer,boolean,text,text) to service_role;
notify pgrst,'reload schema';
