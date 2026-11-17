-- ════════════════════════════════════════════════════════════════════
--  AirMilesHK Marketplace — database schema (Phase one)
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run once on a fresh project.
-- ════════════════════════════════════════════════════════════════════

-- ── Members ─────────────────────────────────────────────────────────
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  full_name         text not null default '' check (length(full_name) <= 120),
  display_name      text not null default '' check (length(display_name) <= 40),
  whatsapp          text not null default '' check (length(whatsapp) <= 40),
  country           text not null default '' check (length(country) <= 60),
  role              text not null default 'both' check (role in ('buyer','seller','both')),
  is_admin          boolean not null default false,
  is_suspended      boolean not null default false,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now()
);

-- Create a profile automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, display_name, whatsapp, country, role, terms_accepted_at)
  values (
    new.id,
    new.email,
    left(coalesce(m->>'full_name', ''), 120),
    left(coalesce(nullif(trim(m->>'display_name'), ''), 'Member ' || left(new.id::text, 6)), 40),
    left(coalesce(m->>'whatsapp', ''), 40),
    left(coalesce(m->>'country', ''), 60),
    case when m->>'role' in ('buyer','seller','both') then m->>'role' else 'both' end,
    case when m->>'terms_accepted' = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers used by the security rules below.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not is_suspended)
$$;

-- ── Listings ────────────────────────────────────────────────────────
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  programme       text not null check (length(programme) between 2 and 80),
  programme_type  text not null check (programme_type in ('airline','hotel','bank','other')),
  balance         bigint not null check (balance > 0 and balance < 100000000),
  sell_whole      boolean not null default false,
  sell_partial    boolean not null default true,
  min_per_deal    bigint check (min_per_deal is null or min_per_deal > 0),
  offers_booking  boolean not null default false,
  price_mode      text not null default 'offers' check (price_mode in ('fixed','offers')),
  price_cpp       numeric(8,3) check (price_cpp is null or (price_cpp > 0 and price_cpp < 100)),   -- US cents per mile/point
  whole_price_usd numeric(12,2) check (whole_price_usd is null or whole_price_usd > 0),
  elite_status    text not null default '' check (length(elite_status) <= 80),
  notes           text not null default '' check (length(notes) <= 2000),
  status          text not null default 'active' check (status in ('active','paused','removed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint listing_has_option check (sell_whole or sell_partial or offers_booking),
  constraint listing_has_price  check (price_mode = 'offers' or price_cpp is not null or whole_price_usd is not null)
);
create index listings_status_idx on public.listings (status, created_at desc);
create index listings_seller_idx on public.listings (seller_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

-- ── Offers / deals ──────────────────────────────────────────────────
create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  buyer_id        uuid not null references public.profiles(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  kind            text not null check (kind in ('purchase','whole_account','booking')),
  quantity        bigint check (quantity is null or quantity > 0),
  price_cpp       numeric(8,3),
  total_usd       numeric(12,2),
  booking_details text not null default '' check (length(booking_details) <= 2000),
  status          text not null default 'open'
                  check (status in ('open','accepted','declined','withdrawn','completed','cancelled')),
  awaiting        uuid references public.profiles(id),   -- whose turn it is while status = 'open'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index offers_buyer_idx   on public.offers (buyer_id, updated_at desc);
create index offers_seller_idx  on public.offers (seller_id, updated_at desc);
create index offers_listing_idx on public.offers (listing_id);
create unique index offers_one_open_per_buyer on public.offers (listing_id, buyer_id) where status = 'open';

create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();

create table public.offer_events (
  id         bigint generated always as identity primary key,
  offer_id   uuid not null references public.offers(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null check (action in ('offer','counter','accept','decline','withdraw','complete','cancel','reopen')),
  quantity   bigint,
  price_cpp  numeric(8,3),
  total_usd  numeric(12,2),
  message    text not null default '' check (length(message) <= 2000),
  created_at timestamptz not null default now()
);
create index offer_events_offer_idx on public.offer_events (offer_id, id);

-- ── Public member names (display name only — never email/WhatsApp) ──
create view public.member_directory with (security_invoker = false) as
  select p.id, p.display_name, p.created_at
  from public.profiles p
  where auth.uid() is not null
     or exists (select 1 from public.listings l where l.seller_id = p.id and l.status = 'active');

-- ════════════════════════════════════════════════════════════════════
--  Security rules (Row Level Security)
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles     enable row level security;
alter table public.listings     enable row level security;
alter table public.offers       enable row level security;
alter table public.offer_events enable row level security;

revoke all on public.profiles, public.listings, public.offers, public.offer_events, public.member_directory
  from anon, authenticated;

-- profiles: you see yourself; Eran (admin) sees everyone.
grant select on public.profiles to authenticated;
grant update (full_name, display_name, whatsapp, country, role) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- listings: anyone can browse active listings; sellers manage their own; admin manages all.
grant select on public.listings to anon, authenticated;
grant insert (programme, programme_type, balance, sell_whole, sell_partial, min_per_deal, offers_booking,
              price_mode, price_cpp, whole_price_usd, elite_status, notes, status)
  on public.listings to authenticated;
grant update (programme, programme_type, balance, sell_whole, sell_partial, min_per_deal, offers_booking,
              price_mode, price_cpp, whole_price_usd, elite_status, notes, status)
  on public.listings to authenticated;
-- (security definer so that visitors who are not signed in, and have no access to offers, can still browse)
create or replace function public.is_buyer_on(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offers where listing_id = p_listing and buyer_id = auth.uid())
$$;
create policy listings_select on public.listings for select to anon, authenticated
  using (status = 'active' or seller_id = auth.uid() or public.is_admin() or public.is_buyer_on(id));
create policy listings_insert on public.listings for insert to authenticated
  with check (seller_id = auth.uid() and public.is_active_member());
create policy listings_update_own on public.listings for update to authenticated
  using (seller_id = auth.uid() and public.is_active_member())
  with check (seller_id = auth.uid());
create policy listings_update_admin on public.listings for update to authenticated
  using (public.is_admin()) with check (true);

-- offers & their history: only the two parties and admin. All changes go through the functions below.
grant select on public.offers, public.offer_events to authenticated;
create policy offers_select on public.offers for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
create policy offer_events_select on public.offer_events for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_events.offer_id
                 and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or public.is_admin())));

grant select on public.member_directory to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
--  Deal actions (server-side rules — the browser cannot bypass these)
-- ════════════════════════════════════════════════════════════════════

-- Buyer sends an offer or a ticket/stay request.
create or replace function public.create_offer(
  p_listing uuid, p_kind text, p_quantity bigint, p_price_cpp numeric,
  p_total_usd numeric, p_message text, p_booking_details text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  v_total numeric;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if not public.is_active_member() then raise exception 'Your account cannot send offers right now.'; end if;

  select * into l from public.listings where id = p_listing;
  if not found or l.status <> 'active' then raise exception 'This listing is no longer available.'; end if;
  if l.seller_id = auth.uid() then raise exception 'You cannot make an offer on your own listing.'; end if;

  if p_kind = 'purchase' then
    if not l.sell_partial then raise exception 'This seller is not selling partial amounts.'; end if;
    if p_quantity is null or p_quantity <= 0 then raise exception 'Enter how many miles/points you want.'; end if;
    if p_quantity > l.balance then raise exception 'That is more than the seller has.'; end if;
    if l.min_per_deal is not null and p_quantity < l.min_per_deal then
      raise exception 'The minimum for this listing is % per deal.', l.min_per_deal; end if;
  elsif p_kind = 'whole_account' then
    if not l.sell_whole then raise exception 'This seller is not selling the whole account.'; end if;
    p_quantity := l.balance;
  elsif p_kind = 'booking' then
    if not l.offers_booking then raise exception 'This seller does not issue tickets or book stays.'; end if;
    if coalesce(trim(p_booking_details), '') = '' then raise exception 'Describe the ticket or stay you need.'; end if;
  else
    raise exception 'Unknown offer type.';
  end if;

  if p_price_cpp is not null and (p_price_cpp <= 0 or p_price_cpp >= 100) then raise exception 'Price per mile looks wrong.'; end if;
  v_total := coalesce(p_total_usd, case when p_quantity is not null and p_price_cpp is not null
                                        then round(p_quantity * p_price_cpp / 100, 2) end);
  if v_total is null or v_total <= 0 then raise exception 'Enter your offer price.'; end if;

  insert into public.offers (listing_id, buyer_id, seller_id, kind, quantity, price_cpp, total_usd, booking_details, awaiting)
  values (l.id, auth.uid(), l.seller_id, p_kind, p_quantity, p_price_cpp, v_total,
          left(coalesce(p_booking_details, ''), 2000), l.seller_id)
  returning id into v_id;

  insert into public.offer_events (offer_id, actor_id, action, quantity, price_cpp, total_usd, message)
  values (v_id, auth.uid(), 'offer', p_quantity, p_price_cpp, v_total, left(coalesce(p_message, ''), 2000));

  return v_id;
exception when unique_violation then
  raise exception 'You already have an open offer on this listing — open it from My Deals.';
end $$;

-- Accept / counter / decline (whoever's turn it is) or withdraw (buyer).
create or replace function public.respond_offer(
  p_offer uuid, p_action text, p_quantity bigint, p_price_cpp numeric, p_total_usd numeric, p_message text
) returns void language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
  l public.listings;
  v_other uuid;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into o from public.offers where id = p_offer for update;
  if not found or auth.uid() not in (o.buyer_id, o.seller_id) then raise exception 'Deal not found.'; end if;
  if o.status <> 'open' then raise exception 'This deal is already %.', o.status; end if;
  v_other := case when auth.uid() = o.buyer_id then o.seller_id else o.buyer_id end;

  if p_action = 'withdraw' then
    if auth.uid() <> o.buyer_id then raise exception 'Only the buyer can withdraw an offer.'; end if;
    update public.offers set status = 'withdrawn', awaiting = null where id = o.id;

  elsif p_action in ('accept', 'decline', 'counter') then
    if o.awaiting is distinct from auth.uid() then raise exception 'Waiting for the other side to respond.'; end if;
    if p_action = 'accept' then
      update public.offers set status = 'accepted', awaiting = null where id = o.id;
    elsif p_action = 'decline' then
      update public.offers set status = 'declined', awaiting = null where id = o.id;
    else
      select * into l from public.listings where id = o.listing_id;
      if o.kind = 'whole_account' then p_quantity := o.quantity; end if;
      if o.kind = 'purchase' then
        if p_quantity is null or p_quantity <= 0 then raise exception 'Enter a quantity.'; end if;
        if p_quantity > l.balance then raise exception 'That is more than the listed balance.'; end if;
      end if;
      if p_price_cpp is not null and (p_price_cpp <= 0 or p_price_cpp >= 100) then raise exception 'Price per mile looks wrong.'; end if;
      v_total := coalesce(p_total_usd, case when p_quantity is not null and p_price_cpp is not null
                                            then round(p_quantity * p_price_cpp / 100, 2) end);
      if v_total is null or v_total <= 0 then raise exception 'Enter a price.'; end if;
      update public.offers
        set quantity = coalesce(p_quantity, quantity), price_cpp = p_price_cpp, total_usd = v_total, awaiting = v_other
        where id = o.id;
      p_total_usd := v_total;
    end if;
  else
    raise exception 'Unknown action.';
  end if;

  insert into public.offer_events (offer_id, actor_id, action, quantity, price_cpp, total_usd, message)
  values (o.id, auth.uid(), p_action,
          case when p_action = 'counter' then coalesce(p_quantity, o.quantity) end,
          case when p_action = 'counter' then p_price_cpp end,
          case when p_action = 'counter' then p_total_usd end,
          left(coalesce(p_message, ''), 2000));
end $$;

-- Admin: mark a deal completed / cancelled / back to accepted, with a note.
create or replace function public.admin_update_offer(p_offer uuid, p_status text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_status not in ('completed', 'cancelled', 'accepted') then raise exception 'Unknown status.'; end if;
  update public.offers set status = p_status, awaiting = null where id = p_offer;
  if not found then raise exception 'Deal not found.'; end if;
  insert into public.offer_events (offer_id, actor_id, action, message)
  values (p_offer, auth.uid(),
          case p_status when 'completed' then 'complete' when 'cancelled' then 'cancel' else 'reopen' end,
          left(coalesce(p_message, ''), 2000));
end $$;

-- Admin: suspend / unsuspend a member.
create or replace function public.admin_set_suspended(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_user = auth.uid() then raise exception 'You cannot suspend yourself.'; end if;
  update public.profiles set is_suspended = p_value where id = p_user;
end $$;

revoke execute on function public.create_offer(uuid, text, bigint, numeric, numeric, text, text) from public, anon;
revoke execute on function public.respond_offer(uuid, text, bigint, numeric, numeric, text)     from public, anon;
revoke execute on function public.admin_update_offer(uuid, text, text)                           from public, anon;
revoke execute on function public.admin_set_suspended(uuid, boolean)                             from public, anon;
revoke execute on function public.handle_new_user()                                              from public, anon, authenticated;
grant  execute on function public.create_offer(uuid, text, bigint, numeric, numeric, text, text) to authenticated;
grant  execute on function public.respond_offer(uuid, text, bigint, numeric, numeric, text)     to authenticated;
grant  execute on function public.admin_update_offer(uuid, text, text)                           to authenticated;
grant  execute on function public.admin_set_suspended(uuid, boolean)                             to authenticated;

-- ════════════════════════════════════════════════════════════════════
--  After you have signed up on the site, make yourself admin.
--  Replace the email below with yours, then run just this line:
--
--    update public.profiles set is_admin = true where email = 'YOUR-EMAIL-HERE';
-- ════════════════════════════════════════════════════════════════════
