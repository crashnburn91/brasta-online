alter function public.brasta_finalize_ranked_match(uuid, text, integer, integer, uuid, double precision, double precision, double precision, uuid, double precision, double precision, double precision, jsonb)
security definer;

revoke all on function public.brasta_finalize_ranked_match(uuid, text, integer, integer, uuid, double precision, double precision, double precision, uuid, double precision, double precision, double precision, jsonb)
from public, anon, authenticated;

grant execute on function public.brasta_finalize_ranked_match(uuid, text, integer, integer, uuid, double precision, double precision, double precision, uuid, double precision, double precision, double precision, jsonb)
to service_role;

notify pgrst, 'reload schema';
