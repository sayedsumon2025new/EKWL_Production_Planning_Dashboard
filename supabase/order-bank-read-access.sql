-- Restore Order Bank reads through the existing security-invoker views.
-- Only authenticated, active admins or users with slide_14 permission may read.
-- RLS stays enabled; these policies authorize SELECT only.
begin;

create policy order_bank_raw_read on public.order_bank_raw
for select to authenticated
using ((select public.current_site_can('slide_14')));

create policy order_bank_upload_batches_read on public.order_bank_upload_batches
for select to authenticated
using ((select public.current_site_can('slide_14')));

commit;
