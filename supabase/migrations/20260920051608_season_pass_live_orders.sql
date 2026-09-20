-- Production sale gate defaults closed, independently of application configuration.
create table public.season_pass_sales_settings (
 season_id text primary key references public.season_pass_seasons(season_id),
 enabled boolean not null default false
);
insert into public.season_pass_sales_settings(season_id) values('season_1');
create table public.season_pass_web_orders (
 order_id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.profiles(id),
 season_id text not null references public.season_pass_seasons(season_id),
 amount_cents integer not null check(amount_cents>0), currency text not null,
 checkout_session_id text unique, payment_intent_id text unique,
 status text not null default 'created' check(status in ('created','open','paid','expired')),
 fulfillment_status text not null default 'none' check(fulfillment_status in ('none','active','refunded','disputed','revoked')),
 amount_refunded integer not null default 0 check(amount_refunded between 0 and amount_cents),
 dispute_id text, dispute_state text not null default 'none' check(dispute_state in ('none','open','won','lost')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 purchased_at timestamptz, updated_at timestamptz not null default now()
);
create index on public.season_pass_web_orders(player_id,season_id,created_at desc);
create index on public.season_pass_web_orders(season_id);
alter table public.season_pass_sales_settings enable row level security;
alter table public.season_pass_web_orders enable row level security;
create policy server_only on public.season_pass_sales_settings for all to anon,authenticated using(false) with check(false);
create policy server_only on public.season_pass_web_orders for all to anon,authenticated using(false) with check(false);
revoke all on public.season_pass_sales_settings,public.season_pass_web_orders from public,anon,authenticated;
grant select,insert,update on public.season_pass_sales_settings,public.season_pass_web_orders to service_role;

create function public.brasta_start_web_checkout(p_player_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_season public.season_pass_seasons; v_order public.season_pass_web_orders;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('web-checkout:'||p_player_id::text,0));
 select s.* into strict v_season from public.season_pass_seasons s
 join public.season_pass_sales_settings c on c.season_id=s.season_id
 where s.season_id='season_1' and c.enabled and s.status='active' and s.starts_at<=now()
 and s.ends_at>now()+interval '31 minutes';
 if exists(select 1 from public.season_pass_entitlements where player_id=p_player_id and season_id=v_season.season_id and status='active') then
  return jsonb_build_object('already_owned',true);
 end if;
 if exists(select 1 from public.season_pass_web_orders where player_id=p_player_id and season_id=v_season.season_id and fulfillment_status in ('disputed','revoked')) then raise exception 'Disputed purchase requires review'; end if;
 update public.season_pass_web_orders set status='expired',updated_at=now() where player_id=p_player_id and
 ((status='open' and expires_at<=now()) or (status='created' and expires_at<now()+interval '31 minutes'));
 select * into v_order from public.season_pass_web_orders where player_id=p_player_id and season_id=v_season.season_id and status in ('created','open') order by created_at desc limit 1;
 if found then return to_jsonb(v_order); end if;
 insert into public.season_pass_web_orders(player_id,season_id,amount_cents,currency,expires_at)
 values(p_player_id,v_season.season_id,v_season.price_cents,lower(v_season.currency),least(now()+interval '1 hour',v_season.ends_at)) returning * into v_order;
 return to_jsonb(v_order);
end $$;

create function public.brasta_reconcile_web_checkout(
 p_order_id uuid,p_session_id text,p_status text,p_amount integer,p_currency text,
 p_intent_id text,p_refunded integer,p_purchased_at timestamptz,p_livemode boolean,
 p_dispute_id text,p_dispute_state text
) returns void language plpgsql security invoker set search_path='' as $$
declare v_order public.season_pass_web_orders; v_state text; v_refunded integer; v_receipt_status text;
begin
 if p_livemode is distinct from true or p_session_id is null or p_session_id !~ '^cs_live_[A-Za-z0-9]+$'
 or p_status is null or p_status not in ('open','expired','paid') then raise exception 'Invalid live checkout'; end if;
 select * into strict v_order from public.season_pass_web_orders where order_id=p_order_id;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('web-checkout:'||v_order.player_id::text,0));
 select * into strict v_order from public.season_pass_web_orders where order_id=p_order_id for update;
 if p_amount is distinct from v_order.amount_cents or p_currency is distinct from v_order.currency
 or (v_order.checkout_session_id is not null and v_order.checkout_session_id<>p_session_id) then raise exception 'Checkout does not match order'; end if;
 if p_status<>'paid' then
  if v_order.status='paid' or (v_order.status='expired' and p_status='open') then return; end if;
  update public.season_pass_web_orders set status=p_status,checkout_session_id=p_session_id,updated_at=now() where order_id=p_order_id;
  return;
 end if;
 if p_intent_id is null or p_intent_id !~ '^pi_[A-Za-z0-9]+$'
 or p_refunded is null or p_refunded<0 or p_refunded>p_amount
 or p_purchased_at is null or p_purchased_at<date_trunc('second',v_order.created_at) or p_purchased_at>now()
 or p_purchased_at>=v_order.expires_at
 or (v_order.payment_intent_id is not null and v_order.payment_intent_id<>p_intent_id)
 or (v_order.purchased_at is not null and v_order.purchased_at<>p_purchased_at)
 or p_dispute_state is null or p_dispute_state not in ('none','open','won','lost')
 or (p_dispute_state='none' and p_dispute_id is not null)
 or (p_dispute_state<>'none' and (p_dispute_id is null or p_dispute_id !~ '^du_[A-Za-z0-9]+$')) then raise exception 'Invalid live payment'; end if;
 if v_order.dispute_id is not null and p_dispute_id is not null and v_order.dispute_id<>p_dispute_id then raise exception 'Different dispute requires review'; end if;
 v_state:=case when v_order.dispute_state in ('won','lost') or p_dispute_state='none' then v_order.dispute_state else p_dispute_state end;
 v_refunded:=greatest(v_order.amount_refunded,p_refunded);
 v_receipt_status:=case when v_refunded=p_amount then 'refunded' when v_state='lost' then 'revoked' when v_state='open' then 'pending' else 'active' end;
 perform public.brasta_reconcile_web_pass_receipt(v_order.player_id,v_order.season_id,p_intent_id,v_receipt_status,p_amount,p_currency,p_purchased_at,true);
 update public.season_pass_web_orders set checkout_session_id=p_session_id,payment_intent_id=p_intent_id,
  status='paid',purchased_at=p_purchased_at,amount_refunded=v_refunded,dispute_id=coalesce(dispute_id,p_dispute_id),dispute_state=v_state,
  fulfillment_status=case when v_receipt_status='pending' then 'disputed' else v_receipt_status end,updated_at=now()
 where order_id=p_order_id;
end $$;
revoke all on function public.brasta_start_web_checkout(uuid) from public,anon,authenticated;
revoke all on function public.brasta_reconcile_web_checkout(uuid,text,text,integer,text,text,integer,timestamptz,boolean,text,text) from public,anon,authenticated;
grant execute on function public.brasta_start_web_checkout(uuid) to service_role;
grant execute on function public.brasta_reconcile_web_checkout(uuid,text,text,integer,text,text,integer,timestamptz,boolean,text,text) to service_role;

-- Dormant until a verified LIVE provider adapter calls it. Sandbox receipts never do.
create or replace function public.brasta_reconcile_web_pass_receipt(
 p_player_id uuid, p_season_id text, p_transaction_id text, p_status text,
 p_amount_cents integer, p_currency text, p_purchased_at timestamptz, p_livemode boolean
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
 v_season public.season_pass_seasons;
 v_receipt public.season_pass_entitlements;
 v_removed text[];
begin
 if p_livemode is distinct from true then raise exception 'Sandbox receipt cannot grant real ownership'; end if;
 if p_transaction_id is null or p_transaction_id !~ '^pi_[A-Za-z0-9]+$'
 or p_player_id is null or p_season_id is null or p_status is null
 or p_status not in ('pending','active','refunded','revoked') then raise exception 'Invalid receipt'; end if;
 -- A provider transaction cannot be reassigned to another account or season.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('web-receipt:'||p_transaction_id,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_player_id::text||':'||p_season_id,0));
 select * into v_receipt from public.season_pass_entitlements
 where provider='web' and provider_transaction_id=p_transaction_id for update;
 if found then
  if v_receipt.player_id<>p_player_id or v_receipt.season_id<>p_season_id
   or v_receipt.amount_cents is distinct from p_amount_cents
   or v_receipt.currency is distinct from upper(p_currency)
   or v_receipt.purchased_at is distinct from p_purchased_at then raise exception 'Receipt does not match purchase'; end if;
  -- Replayed payment success must never undo a refund or revocation.
  if v_receipt.status in ('refunded','revoked') then return v_receipt.entitlement_id; end if;
  update public.season_pass_entitlements set status=p_status,updated_at=now(),
   refunded_at=case when p_status='refunded' then now() else refunded_at end
  where entitlement_id=v_receipt.entitlement_id;
 else
  select * into strict v_season from public.season_pass_seasons where season_id=p_season_id;
  if v_season.status='draft' or v_season.starts_at is null or v_season.ends_at is null
   or p_purchased_at is null or p_purchased_at< v_season.starts_at
   or p_purchased_at>=v_season.ends_at or p_purchased_at>now()
   or p_amount_cents is distinct from v_season.price_cents
   or upper(p_currency) is distinct from v_season.currency then raise exception 'Purchase outside sale terms'; end if;
  insert into public.season_pass_entitlements
   (player_id,season_id,provider,provider_transaction_id,status,amount_cents,currency,purchased_at,refunded_at)
  values(p_player_id,p_season_id,'web',p_transaction_id,p_status,p_amount_cents,upper(p_currency),p_purchased_at,
   case when p_status='refunded' then now() end) returning * into v_receipt;
 end if;
 if p_status='active' then
  perform public.brasta_grant_season_pass_rewards(p_player_id,p_season_id);
 elsif not exists(select 1 from public.season_pass_entitlements
  where player_id=p_player_id and season_id=p_season_id and status='active') then
  -- Ownership row locks serialize this with equipment saves. Clear selections afterward.
  with removed as (
   delete from public.season_pass_reward_ownership o using public.season_pass_rewards r
   where o.player_id=p_player_id and o.season_id=p_season_id and o.reward_id=r.reward_id
    and r.is_premium and o.source='premium_entitlement' returning o.reward_id
  ) select array_agg(reward_id) into v_removed from removed;
  update public.season_pass_equipment set reward_id=null,updated_at=now(),
   title_source=case when slot='profile_title' then 'none' else null end
  where player_id=p_player_id and reward_id=any(v_removed);
 end if;
 return v_receipt.entitlement_id;
end $$;
revoke all on function public.brasta_reconcile_web_pass_receipt(uuid,text,text,text,integer,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.brasta_reconcile_web_pass_receipt(uuid,text,text,text,integer,text,timestamptz,boolean) to service_role;
notify pgrst,'reload schema';
