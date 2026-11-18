-- ════════════════════════════════════════════════════════════════════
--  AirMilesHK Marketplace — add-ons (run AFTER schema.sql)
--  1. Sell-quote form with optional auto-listing
--  2. Bid and deal alerts (in-site notifications + email via Resend)
--  3. One-tap WhatsApp log for admin
--  Email alerts need a Vault secret named  resend_api_key  (Supabase → Integrations → Vault).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;

-- ── 1. Quote requests ───────────────────────────────────────────────
create table public.quote_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null default '' check (length(name) <= 120),
  phone           text not null check (length(phone) between 6 and 40),
  email           text not null default '' check (length(email) <= 200),
  programme       text not null check (length(programme) between 2 and 80),
  programme_type  text not null check (programme_type in ('airline','hotel','bank','other')),
  balance         bigint not null check (balance > 0 and balance < 100000000),
  sell_whole      boolean not null default false,
  sell_partial    boolean not null default false,
  min_per_deal    bigint,
  offers_booking  boolean not null default false,
  price_mode      text not null default 'offers' check (price_mode in ('fixed','offers')),
  price_cpp       numeric(8,3),
  whole_price_usd numeric(12,2),
  notes           text not null default '' check (length(notes) <= 1000),
  wants_listing   boolean not null default false,
  listing_id      uuid references public.listings(id) on delete set null,
  member_id       uuid references public.profiles(id) on delete set null,
  attach          text not null default 'none' check (attach in ('none','new_member','existing_member','managed')),
  status          text not null default 'new' check (status in ('new','contacted','closed'))
);
create index quote_requests_created_idx on public.quote_requests (created_at desc);

-- Listings created from a quote. managed = phone-only seller, run by AirMilesHK (listed under the admin account).
alter table public.listings add column managed boolean not null default false;
alter table public.listings add column quote_id uuid references public.quote_requests(id) on delete set null;

alter table public.quote_requests enable row level security;
revoke all on public.quote_requests from anon, authenticated;
grant select on public.quote_requests to authenticated;
create policy quote_requests_admin on public.quote_requests for select to authenticated using (public.is_admin());

-- Public form submit. Saves the request; if the seller opted in, creates the listing.
create or replace function public.submit_sell_quote(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
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
  v_attach text := 'none'; v_status text := 'active';
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'Something went wrong. Please try again.'; end if;  -- bot trap
  begin
    v_bal := nullif(p->>'balance', '')::bigint;
    v_min := nullif(p->>'min_per_deal', '')::bigint;
    v_cpp := nullif(p->>'price_cpp', '')::numeric;
    v_wp  := nullif(p->>'whole_price_usd', '')::numeric;
  exception when others then raise exception 'Please check the numbers you entered.';
  end;
  if length(v_digits) < 7 then raise exception 'Enter your phone number with country code.'; end if;
  if v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'That email address looks wrong.'; end if;
  if length(v_prog) < 2 then raise exception 'Choose your programme.'; end if;
  if v_type not in ('airline','hotel','bank','other') then v_type := 'other'; end if;
  if v_bal is null or v_bal <= 0 or v_bal >= 100000000 then raise exception 'Enter your balance.'; end if;
  if v_mode not in ('fixed','offers') then v_mode := 'offers'; end if;
  if v_cpp is not null and (v_cpp <= 0 or v_cpp >= 100) then raise exception 'Price per mile should be in US cents, e.g. 1.25.'; end if;
  if v_wp is not null and v_wp <= 0 then v_wp := null; end if;
  if v_min is not null and (v_min <= 0 or v_min > v_bal) then v_min := null; end if;
  if not v_partial then v_min := null; end if;
  if v_mode = 'offers' then v_cpp := null; v_wp := null; end if;
  if v_wants then
    if not (v_whole or v_partial or v_book) then raise exception 'Choose at least one way to sell.'; end if;
    if v_mode = 'fixed' and v_cpp is null and v_wp is null then raise exception 'Enter an asking price, or choose "Open to offers".'; end if;
  end if;

  -- Simple abuse limits.
  if (select count(*) from public.quote_requests
      where regexp_replace(phone, '\D', '', 'g') = v_digits and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You have already sent several requests. We will be in touch on WhatsApp.';
  end if;
  if (select count(*) from public.quote_requests where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'We are receiving a lot of requests right now. Please try again in a minute.';
  end if;

  insert into public.quote_requests (name, phone, email, programme, programme_type, balance, sell_whole, sell_partial,
    min_per_deal, offers_booking, price_mode, price_cpp, whole_price_usd, notes, wants_listing)
  values (v_name, v_phone, v_email, v_prog, v_type, v_bal, v_whole, v_partial,
    v_min, v_book, v_mode, v_cpp, v_wp, v_notes, v_wants)
  returning id into v_q;

  if v_wants then
    -- Seller with an email: the form has just created (or found) their account.
    if v_email <> '' then
      select id, created_at into v_member, v_member_created from public.profiles where lower(email) = v_email limit 1;
    end if;
    if v_member is not null then
      v_seller := v_member;
      if v_member_created > now() - interval '15 minutes' then
        v_attach := 'new_member';
      else
        -- An existing member: add the ad paused, so nobody can post ads to someone else's account.
        v_attach := 'existing_member'; v_status := 'paused';
      end if;
    else
      -- Phone only: AirMilesHK runs the ad under the admin account; the seller's phone stays in this quote.
      v_attach := 'managed';
      select id into v_seller from public.profiles where is_admin order by created_at limit 1;
      if v_seller is null then raise exception 'The marketplace is not ready yet. Please message us on WhatsApp.'; end if;
    end if;

    insert into public.listings (seller_id, programme, programme_type, balance, sell_whole, sell_partial, min_per_deal,
      offers_booking, price_mode, price_cpp, whole_price_usd, notes, status, managed, quote_id)
    values (v_seller, v_prog, v_type, v_bal, v_whole, v_partial, v_min,
      v_book, v_mode, v_cpp, v_wp, '', v_status, v_attach = 'managed', v_q)
    returning id into v_l;

    update public.quote_requests set listing_id = v_l, member_id = v_member, attach = v_attach where id = v_q;
  end if;

  return jsonb_build_object('quote_id', v_q, 'listing_id', v_l, 'attach', v_attach,
                            'listing_status', case when v_l is null then null else v_status end);
end $$;

create or replace function public.admin_set_quote_status(p_quote uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_status not in ('new','contacted','closed') then raise exception 'Unknown status.'; end if;
  update public.quote_requests set status = p_status where id = p_quote;
end $$;

-- ── 2. Notifications (bell + email) ─────────────────────────────────
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text not null default '',
  offer_id   uuid references public.offers(id) on delete cascade,
  read_at    timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

create or replace function public.html_escape(t text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function public.add_notification(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_offer uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link, offer_id)
  select p_user, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500), p_link, p_offer where p_user is not null;
$$;

-- Who gets told what, for every deal step.
create or replace function public.notify_on_offer_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o public.offers; l public.listings; a record;
  v_prog text; v_link text; v_amt text; v_other uuid; v_what text;
begin
  select * into o from public.offers where id = new.offer_id;
  if not found then return new; end if;
  select * into l from public.listings where id = o.listing_id;
  v_prog := coalesce(l.programme, 'your listing');
  v_link := '/deal.html?id=' || o.id;
  v_amt  := 'US$' || regexp_replace(to_char(coalesce(new.total_usd, o.total_usd, 0), 'FM999,999,990.00'), '\.00$', '');
  v_what := case when o.kind = 'booking' then 'booking request (budget ' || v_amt || ')' else 'offer of ' || v_amt end;
  v_other := case when new.actor_id = o.buyer_id then o.seller_id else o.buyer_id end;

  if new.action = 'offer' then
    perform public.add_notification(o.seller_id, 'new_offer', 'New ' || v_what || ' on your ' || v_prog || ' listing', new.message, v_link, o.id);
    for a in select id from public.profiles where is_admin and id <> o.seller_id loop
      perform public.add_notification(a.id, 'admin_new_offer', 'New ' || v_what || ' on ' || v_prog, new.message, v_link, o.id);
    end loop;
  elsif new.action = 'counter' then
    perform public.add_notification(v_other, 'counter', 'Counter-offer of ' || v_amt || ' on ' || v_prog, new.message, v_link, o.id);
  elsif new.action = 'accept' then
    perform public.add_notification(v_other, 'accepted', 'Deal agreed: ' || v_prog || ' for ' || v_amt,
      'AirMilesHK will contact you on WhatsApp to arrange payment and delivery.', v_link, o.id);
    for a in select id from public.profiles where is_admin and id not in (o.buyer_id, o.seller_id) loop
      perform public.add_notification(a.id, 'admin_deal_agreed', 'Deal agreed: ' || v_prog || ' for ' || v_amt, 'Arrange payment and delivery.', v_link, o.id);
    end loop;
  elsif new.action = 'decline' then
    perform public.add_notification(v_other, 'declined', 'Offer declined on ' || v_prog, new.message, v_link, o.id);
  elsif new.action = 'withdraw' then
    perform public.add_notification(o.seller_id, 'withdrawn', 'Offer withdrawn on ' || v_prog, new.message, v_link, o.id);
  elsif new.action in ('complete', 'cancel', 'reopen') then
    perform public.add_notification(x, 'deal_' || new.action,
      case new.action when 'complete' then 'Deal completed: ' when 'cancel' then 'Deal cancelled: ' else 'Deal back to agreed: ' end || v_prog,
      new.message, v_link, o.id)
    from unnest(array[o.buyer_id, o.seller_id]) as x;
  end if;
  return new;
end $$;

create trigger offer_events_notify after insert on public.offer_events
  for each row execute function public.notify_on_offer_event();

-- Email every notification through Resend (needs the Vault secret). Never blocks the deal step.
create or replace function public.email_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_key text; v_email text; v_name text; v_html text; v_url text;
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then v_key := null;
  end;
  if v_key is null then return new; end if;
  select email, display_name into v_email, v_name from public.profiles where id = new.user_id;
  if coalesce(v_email, '') = '' then return new; end if;
  v_url := 'https://market.airmileshk.com' || coalesce(nullif(new.link, ''), '/account.html#notifications');
  v_html :=
    '<div style="background:#F7F8FC;padding:28px 12px;font-family:Arial,Helvetica,sans-serif">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4E9F0;border-radius:12px;overflow:hidden">'
    || '<div style="background:#0B1F45;padding:22px 28px"><img src="https://market.airmileshk.com/assets/logo-white.png" alt="AirMilesHK" width="120" style="display:block">'
    || '<div style="margin-top:8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#E8C97A">Marketplace</div></div>'
    || '<div style="padding:28px">'
    || '<p style="margin:0 0 6px;font-size:14px;color:#8A9BB5">Hi ' || public.html_escape(coalesce(nullif(v_name, ''), 'there')) || ',</p>'
    || '<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:22px;line-height:1.3;color:#0B1F45">' || public.html_escape(new.title) || '</h1>'
    || case when coalesce(new.body, '') <> '' then '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4A5E78;white-space:pre-wrap">' || public.html_escape(new.body) || '</p>' else '' end
    || '<a href="' || v_url || '" style="display:inline-block;background:#C49A3C;color:#0B1F45;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:6px">Open on the marketplace &rarr;</a>'
    || '<p style="margin:22px 0 0;font-size:12px;color:#8A9BB5">Questions? WhatsApp <a href="https://wa.me/85294400450" style="color:#0B1F45">+852 9440 0450</a>.</p>'
    || '</div></div></div>';
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', 'AirMilesHK Marketplace <noreply@market.airmileshk.com>',
                               'to', jsonb_build_array(v_email), 'subject', new.title, 'html', v_html),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json')
  );
  update public.notifications set emailed_at = now() where id = new.id;
  return new;
exception when others then
  return new;
end $$;

create trigger notifications_email after insert on public.notifications
  for each row execute function public.email_notification();

-- ── 3. WhatsApp "sent" log for admin ────────────────────────────────
create table public.admin_wa_log (
  event_id  bigint not null references public.offer_events(id) on delete cascade,
  recipient text not null check (recipient in ('buyer','seller')),
  sent_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  sent_at   timestamptz not null default now(),
  primary key (event_id, recipient)
);
alter table public.admin_wa_log enable row level security;
revoke all on public.admin_wa_log from anon, authenticated;
grant select, insert, delete on public.admin_wa_log to authenticated;
create policy admin_wa_log_all on public.admin_wa_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Permissions for the new functions ───────────────────────────────
revoke execute on function public.submit_sell_quote(jsonb)              from public;
revoke execute on function public.admin_set_quote_status(uuid, text)     from public, anon;
revoke execute on function public.mark_notifications_read(bigint[])      from public, anon;
revoke execute on function public.add_notification(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.notify_on_offer_event()                from public, anon, authenticated;
revoke execute on function public.email_notification()                   from public, anon, authenticated;
grant  execute on function public.submit_sell_quote(jsonb)              to anon, authenticated;
grant  execute on function public.admin_set_quote_status(uuid, text)     to authenticated;
grant  execute on function public.mark_notifications_read(bigint[])      to authenticated;
