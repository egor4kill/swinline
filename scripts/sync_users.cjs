// Syncs all Supabase registered Twitch users directly into public storage registry
const SUPABASE_URL = 'https://vkgzyeugrxxwlouqrxrh.supabase.co';
const secret = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_USERNAME = 'egor4kill';

async function syncUsers() {
  if (!secret) {
    console.log('SUPABASE_SERVICE_KEY not provided in environment, skipping background auth registry sync.');
    return;
  }
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users?page=&per_page=1000', {
      headers: {
        'apikey': secret,
        'Authorization': 'Bearer ' + secret
      }
    });

    if (!res.ok) {
      console.error('Failed to list users:', res.status, await res.text());
      return;
    }

    const data = await res.json();
    if (!data?.users || !Array.isArray(data.users)) {
      console.log('No users found in Supabase Auth');
      return;
    }

    console.log(`Fetched ${data.users.length} users from Supabase Auth.`);

    const accounts = data.users.map(u => {
      const twitchUser = (u.user_metadata?.preferred_username || u.user_metadata?.name || u.user_metadata?.user_name || '').trim();
      const ghUser = (u.user_metadata?.user_name || u.user_metadata?.preferred_username || '').trim();
      let name = twitchUser || ghUser || u.user_metadata?.full_name || u.user_metadata?.name || '';
      if (!name && u.email) {
        name = u.email.split('@')[0];
      }
      name = (name || '').trim() || `User_${u.id.slice(0, 5)}`;

      const isOwner = name.toLowerCase() === ADMIN_USERNAME.toLowerCase();

      const twitchAvatar = u.user_metadata?.picture || u.user_metadata?.avatar_url || (name.toLowerCase() === 'egor4kill' ? 'https://static-cdn.jtvnw.net/jtv_user_pictures/310827f8-113e-442f-9435-bf8637ec3b6a-profile_image-300x300.png' : (name.toLowerCase() === 'lowrensy' ? 'https://static-cdn.jtvnw.net/jtv_user_pictures/6d72a4ce-1517-408b-8d79-2490b31fa178-profile_image-300x300.png' : '🟣'));

      return {
        id: u.id,
        username: name,
        email: u.email,
        role: isOwner ? 'admin' : 'user',
        avatar: twitchAvatar,
        title: isOwner ? 'Владелец платформы (Admin)' : 'Игрок (Twitch)',
        bal: isOwner ? 35000 : 10000,
        bets: [],
        log: [{ t: new Date(u.created_at).getTime(), x: 'Вход через Twitch • Стартовый баланс', d: isOwner ? 35000 : 10000 }],
        createdAt: new Date(u.created_at).getTime(),
        isBlocked: false,
        stats: { totalBets: 0, wonBets: 0, lostBets: 0, totalProfit: 0 },
        achievements: isOwner ? ['Владелец Платформы', 'Создатель Линии'] : ['Игрок Twitch']
      };
    });

    const uploadRes = await fetch(SUPABASE_URL + '/storage/v1/object/public_data/users_registry.json', {
      method: 'POST',
      headers: {
        'apikey': secret,
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: JSON.stringify(accounts, null, 2)
    });

    if (uploadRes.ok) {
      console.log('Successfully updated users_registry.json in public_data bucket!');
      console.log('Users in registry:', accounts.map(a => `${a.username} (${a.role})`));
    } else {
      console.error('Failed to upload users_registry.json:', uploadRes.status, await uploadRes.text());
    }
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

syncUsers();
