-- ════════════════════════════════════════════════════════════════════
--  AirMilesHK Marketplace — every quote creates a listing (run AFTER 004)
--  • Ticked "list me" (with email)  → member listing under the seller's own profile,
--    with their chosen options and price.
--  • Not ticked (or no account)      → house listing "Offered by AirMilesHK":
--    programme + balance only, price on request, bids go to admin only.
--    Linked to the quote request so admin knows whose balance it is.
--  • Admin can switch a house listing to a member listing later.
-- ════════════════════════════════════════════════════════════════════

alter table public.quote_requests drop constraint if exists quote_requests_attach_check;
alter table public.quote_requests add constraint quote_requests_attach_check
  check (attach in ('none','new_member','existing_member','managed','converted'));

create or replace function public.submit_sell_quote(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_src     text := coalesce(nullif(p->>'source', ''), 'form');
  v_phone   text := left(trim(coalesce(p->>'phone', '')), 40);
  v_digits  text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  v_email   text := lower(left(trim(coalesce(p->>'email', '')), 200));
  v_name    text := left(trim(coalesce(p->>'name', '')), 120);
  v_prog    text := left(trim(coalesce(p->>'programme', '')), 80);
  v_type    text := coalesce(p->>'programme_type', 'other');
  v_bal     bigint;
  v_whole   boolean := coalesce((p->>'sell_whole')::boolean, false);
  v_partial boolean := coalesce((p->>'sell_partial')::boolean, false);
  v_min     bigint;
  v_book    boolean := coalesce((p->>'offers_booking')::boolean, false);
  v_mode    text := coalesce(nullif(p->>'price_mode', ''), 'offers');
  v_cpp     numeric;
  v_wp      numeric;
  v_notes   text := left(coalesce(p->>'notes', ''), 1000);
  v_wants   boolean := coalesce((p->>'wants_listing')::boolean, false);
  v_q uuid; v_l uuid; v_member uuid; v_member_created timestamptz; v_seller uuid;
  v_attach text; v_status text := 'active';
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'Something went wrong. Please try again.'; end if;
  if v_src not in ('form', 'mainsite') then v_src := 'form'; end if;
  begin
    v_bal := nullif(regexp_replace(coalesce(p->>'balance', ''), '[^0-9]', '', 'g'), '')::bigint;
    v_min := nullif(p->>'min_per_deal', '')::bigint;
    v_cpp := nullif(p->>'price_cpp', '')::numeric;
    v_wp  := nullif(p->>'whole_price_usd', '')::numeric;
  exception when others then raise exception 'Please check the numbers you entered.';
  end;

  if length(v_digits) < 7 then
    if v_src = 'form' then raise exception 'Enter your phone number with country code.'; end if;
    v_phone := ''; v_digits := '';
  end if;
  if v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    if v_src = 'form' then raise exception 'That email address looks wrong.'; end if;
    v_email := '';
  end if;
  if length(v_prog) < 2 then raise exception 'Choose your programme.'; end if;
  if v_type not in ('airline','hotel','bank','other') then v_type := 'other'; end if;
  if v_bal is null or v_bal <= 0 or v_bal >= 100000000 then raise exception 'Enter your balance.'; end if;
  if v_mode not in ('fixed','offers') then v_mode := 'offers'; end if;
  if v_cpp is not null and (v_cpp <= 0 or v_cpp >= 100) then raise exception 'Price per mile should be in US cents, e.g. 1.25.'; end if;
  if v_wp is not null and v_wp <= 0 then v_wp := null; end if;
  if v_mode = 'offers' then v_cpp := null; v_wp := null; end if;
  if v_mode = 'fixed' and v_cpp is null and v_wp is null then v_mode := 'offers'; end if;
  if not (v_whole or v_partial or v_book) then v_partial := true; end if;
  if not v_partial or (v_min is not null and (v_min <= 0 or v_min > v_bal)) then v_min := null; end if;

  -- Abuse limits.
  if v_digits <> '' and (select count(*) from public.quote_requests
      where regexp_replace(phone, '\D', '', 'g') = v_digits and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You have already sent several requests. We will be in touch on WhatsApp.';
  end if;
  if v_digits = '' and (select count(*) from public.quote_requests
      where phone = '' and source = 'mainsite' and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'We are receiving a lot of requests right now. Please message us on WhatsApp directly.';
  end if;
  if (select count(*) from public.quote_requests where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'We are receiving a lot of requests right now. Please try again in a minute.';
  end if;

  -- The quote keeps everything the seller told us (private, admin only).
  insert into public.quote_requests (source, name, phone, email, programme, programme_type, balance, sell_whole, sell_partial,
    min_per_deal, offers_booking, price_mode, price_cpp, whole_price_usd, notes, wants_listing)
  values (v_src, v_name, v_phone, v_email, v_prog, v_type, v_bal, v_whole, v_partial,
    v_min, v_book, v_mode, v_cpp, v_wp, v_notes, v_wants)
  returning id into v_q;

  -- Ticked: member listing under their own profile (the form has just created or found their account).
  if v_wants and v_email <> '' then
    select id, created_at into v_member, v_member_created from public.profiles where lower(email) = v_email limit 1;
  end if;

  if v_member is not null then
    v_seller := v_member;
    if v_member_created > now() - interval '15 minutes' then v_attach := 'new_member';
    else v_attach := 'existing_member'; v_status := 'paused';   -- never post live into someone else's account
    end if;
    insert into public.listings (seller_id, programme, programme_type, balance, sell_whole, sell_partial, min_per_deal,
      offers_booking, price_mode, price_cpp, whole_price_usd, notes, status, managed, quote_id)
    values (v_seller, v_prog, v_type, v_bal, v_whole, v_partial, v_min,
      v_book, v_mode, v_cpp, v_wp, '', v_status, false, v_q)
    returning id into v_l;
  else
    -- Not ticked (or no account): house listing, programme + balance only, price on request, bids to admin.
    v_attach := 'managed';
    select id into v_seller from public.profiles where is_admin order by created_at limit 1;
    if v_seller is null then raise exception 'The marketplace is not ready yet. Please message us on WhatsApp.'; end if;
    insert into public.listings (seller_id, programme, programme_type, balance, sell_whole, sell_partial, min_per_deal,
      offers_booking, price_mode, price_cpp, whole_price_usd, notes, status, managed, quote_id)
    values (v_seller, v_prog, v_type, v_bal, false, true, null,
      false, 'offers', null, null, '', 'active', true, v_q)
    returning id into v_l;
  end if;

  update public.quote_requests set listing_id = v_l, member_id = v_member, attach = v_attach where id = v_q;

  return jsonb_build_object('quote_id', v_q, 'listing_id', v_l, 'attach', v_attach, 'listing_status', v_status,
                            'listing_type', case when v_attach = 'managed' then 'house' else 'member' end,
                            'ref', 'Q-' || upper(left(replace(v_q::text, '-', ''), 6)));
end $$;

revoke execute on function public.submit_sell_quote(jsonb) from public;
grant  execute on function public.submit_sell_quote(jsonb) to anon, authenticated;

-- Admin: set / correct a request's email (needed before switching to a member listing).
create or replace function public.admin_set_quote_email(p_quote uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'That email address looks wrong.'; end if;
  update public.quote_requests set email = left(v_email, 200) where id = p_quote;
end $$;

-- Admin: switch a house listing to the customer's own member listing.
-- Needs a member account for the request's email (the admin page sends the customer a sign-in link first).
create or replace function public.admin_convert_house_listing(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare q public.quote_requests; v_member uuid;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into q from public.quote_requests where id = p_quote;
  if not found or q.listing_id is null then raise exception 'This request has no listing.'; end if;
  if not exists (select 1 from public.listings where id = q.listing_id and managed) then raise exception 'This is already a member listing.'; end if;
  v_member := q.member_id;
  if v_member is null and coalesce(q.email, '') <> '' then
    select id into v_member from public.profiles where lower(email) = lower(q.email) limit 1;
  end if;
  if v_member is null then raise exception 'The customer has no marketplace account yet. Add their email first.'; end if;
  update public.listings set seller_id = v_member, managed = false where id = q.listing_id;
  update public.quote_requests set member_id = v_member, attach = 'converted', wants_listing = true where id = p_quote;
end $$;

revoke execute on function public.admin_set_quote_email(uuid, text)      from public, anon;
revoke execute on function public.admin_convert_house_listing(uuid)       from public, anon;
grant  execute on function public.admin_set_quote_email(uuid, text)      to authenticated;
grant  execute on function public.admin_convert_house_listing(uuid)       to authenticated;
