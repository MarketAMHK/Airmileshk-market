/* ══════════════════════════════════════════════════════════════
   AirMilesHK Marketplace — settings
   The ONLY file you need to edit to connect Supabase.
   ══════════════════════════════════════════════════════════════ */
window.MARKET_CONFIG = {
  // From Supabase → Project Settings → API (or "Connect").
  // Leave both empty to run the site in DEMO mode (data saved only in your own browser).
  SUPABASE_URL: 'https://poreidsuzrdqionmbgql.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_vZjW6Rn5SokT3Ze8WweBMg_pQgURxdw',   // the "anon" / "publishable" key — designed to be public, safe to put here.
                           // NEVER put the "service_role" / "secret" key here.

  MAIN_SITE: 'https://airmileshk.com',
  WHATSAPP: '85294400450',
  CONTACT_EMAIL: 'sales@airmileshk.com',

  // Programmes shown in the drop-downs. "Other" is always added at the end.
  PROGRAMMES: {
    airline: [
      'Cathay Pacific Asia Miles', 'Emirates Skywards', 'United MileagePlus', 'American AAdvantage',
      'Delta SkyMiles', 'Alaska Mileage Plan', 'British Airways Avios', 'Qatar Airways Avios',
      'Singapore KrisFlyer', 'Air Canada Aeroplan', 'Flying Blue (Air France/KLM)', 'Lufthansa Miles & More',
      'Turkish Miles&Smiles', 'ANA Mileage Club', 'JAL Mileage Bank', 'Qantas Frequent Flyer',
      'Virgin Atlantic Flying Club', 'Etihad Guest', 'Finnair Plus', 'SAS EuroBonus',
      'Thai Royal Orchid Plus', 'Air India Maharaja Club'
    ],
    hotel: [
      'Marriott Bonvoy', 'Hilton Honors', 'IHG One Rewards', 'World of Hyatt',
      'Accor Live Limitless', 'Wyndham Rewards', 'Choice Privileges'
    ],
    bank: [
      'Amex Membership Rewards', 'Chase Ultimate Rewards', 'Citi ThankYou Points',
      'Capital One Miles', 'Bilt Rewards'
    ]
  }
};
