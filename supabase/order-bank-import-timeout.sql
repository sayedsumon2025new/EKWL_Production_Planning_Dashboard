-- Large Order Bank snapshots need more than the default authenticated API timeout (8s).
-- PostgREST honors per-function timeouts; scope the exemption to this admin-only RPC.
alter function public.finalize_order_bank_import(uuid,text,bigint,text[])
  set statement_timeout to '60s';
notify pgrst, 'reload schema';
