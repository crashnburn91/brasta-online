-- Dormant until a verified LIVE provider adapter calls it. Sandbox receipts never do.
create function public.brasta_reconcile_web_pass_receipt(
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
 or p_status not in ('active','refunded','revoked') then raise exception 'Invalid receipt'; end if;
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
