-- ════════════════════════════════════════════════════════════════════
--  AirMilesHK Marketplace — admin "Create ad" (run AFTER 002_addons.sql)
--  Lets an admin post ads directly: no account, no emails. The ad is listed
--  under the admin account as "Listed via AirMilesHK". Optional private seller
--  name/phone are kept in quote_requests (admin-only), never shown publicly.
-- ════════════════════════════════════════════════════════════════════

-- Phone becomes optional for admin-created entries.
alter table public.quote_requests drop constraint if exists quote_requests_phone_check;
alter table public.quote_requests add constraint quote_requests_phone_check check (phone = '' or length(phone) between 6 and 40);
alter table public.quote_requests add column source text not null default 'form' check (source in ('form','admin'));

create or replace function public.admin_create_listing(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_prog    text := left(trim(coalesce(p->>'programme', '')), 80);
  v_type    text := coalesce(p->>'programme_type', 'other');
  v_bal     bigint; v_min bigint; v_cpp numeric; v_wp numeric;
  v_whole   boolean := coalesce((p->>'sell_whole')::boolean, false);
  v_partial boolean := coalesce((p->>'sell_partial')::boolean, false);
  v_book    boolean := coalesce((p->>'offers_booking')::boolean, false);
  v_mode    text := coalesce(nullif(p->>'price_mode', ''), 'offers');
  v_notes   text := left(coalesce(p->>'notes', ''), 2000);
  v_elite   text := left(coalesce(p->>'elite_status', ''), 80);
  v_name    text := left(trim(coalesce(p->>'seller_name', '')), 120);
  v_phone   text := left(trim(coalesce(p->>'seller_phone', '')), 40);
  v_q uuid; v_l uuid;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  begin
    v_bal := nullif(p->>'balance', '')::bigint;
    v_min := nullif(p->>'min_per_deal', '')::bigint;
    v_cpp := nullif(p->>'price_cpp', '')::numeric;
    v_wp  := nullif(p->>'whole_price_usd', '')::numeric;
  exception when others then raise exception 'Please check the numbers you entered.';
  end;
  if length(v_prog) < 2 then raise exception 'Choose a programme.'; end if;
  if v_type not in ('airline','hotel','bank','other') then v_type := 'other'; end if;
  if v_bal is null or v_bal <= 0 or v_bal >= 100000000 then raise exception 'Enter the balance.'; end if;
  if not (v_whole or v_partial or v_book) then raise exception 'Choose at least one way to sell.'; end if;
  if v_mode not in ('fixed','offers') then v_mode := 'offers'; end if;
  if v_mode = 'offers' then v_cpp := null; v_wp := null; end if;
  if v_cpp is not null and (v_cpp <= 0 or v_cpp >= 100) then raise exception 'Price per mile should be in US cents, e.g. 1.25.'; end if;
  if v_wp is not null and v_wp <= 0 then v_wp := null; end if;
  if v_mode = 'fixed' and v_cpp is null and v_wp is null then raise exception 'Enter an asking price, or choose "Open to offers".'; end if;
  if not v_partial or (v_min is not null and (v_min <= 0 or v_min > v_bal)) then v_min := null; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) between 1 and 6 then raise exception 'That phone number looks too short.'; end if;

  insert into public.quote_requests (source, name, phone, programme, programme_type, balance, sell_whole, sell_partial,
    min_per_deal, offers_booking, price_mode, price_cpp, whole_price_usd, wants_listing, attach, status)
  values ('admin', v_name, v_phone, v_prog, v_type, v_bal, v_whole, v_partial,
    v_min, v_book, v_mode, v_cpp, v_wp, true, 'managed', 'contacted')
  returning id into v_q;

  insert into public.listings (seller_id, programme, programme_type, balance, sell_whole, sell_partial, min_per_deal,
    offers_booking, price_mode, price_cpp, whole_price_usd, elite_status, notes, status, managed, quote_id)
  values (auth.uid(), v_prog, v_type, v_bal, v_whole, v_partial, v_min,
    v_book, v_mode, v_cpp, v_wp, v_elite, v_notes, 'active', true, v_q)
  returning id into v_l;

  update public.quote_requests set listing_id = v_l where id = v_q;
  return v_l;
end $$;

revoke execute on function public.admin_create_listing(jsonb) from public, anon;
grant  execute on function public.admin_create_listing(jsonb) to authenticated;
