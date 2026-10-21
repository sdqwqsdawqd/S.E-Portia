(function () {
  'use strict';

  const PROJECT_URL = 'https://bfhqsarezczhclgesudw.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_2tQQkpGQCj0h7OPRcJASLA_AU6gS-bw';
  const OWNER_EMAIL = 'qloxzick@gmail.com';

  if (!window.supabase?.createClient) {
    console.error('Supabase client did not load.');
    return;
  }

  const client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  function normalize(row) {
    if (!row) return null;
    return {
      content: row.content || {},
      revision: Number(row.revision || 0),
      updatedAt: row.updated_at || null,
    };
  }

  async function loadCharter() {
    const { data, error } = await client
      .from('charter_state')
      .select('content,revision,updated_at')
      .eq('id', 'main')
      .single();
    if (error) throw new Error('Не удалось загрузить устав из Supabase.');
    return normalize(data);
  }

  async function getOwnerSession() {
    const { data, error } = await client.auth.getSession();
    if (error) return { signedIn: false, isOwner: false, email: null };
    const email = data.session?.user?.email?.toLowerCase() || null;
    return {
      signedIn: Boolean(data.session),
      isOwner: email === OWNER_EMAIL,
      email,
    };
  }

  async function sendMagicLink(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (normalized !== OWNER_EMAIL) throw new Error('Этот аккаунт не имеет доступа к редактору.');
    const redirectTo = new URL('index.html?edit=1', window.location.href).href;
    const { error } = await client.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw new Error(error.message || 'Не удалось отправить ссылку для входа.');
  }

  async function saveCharter(content, expectedRevision) {
    const { data, error } = await client.rpc('update_charter', {
      p_expected_revision: Number(expectedRevision),
      p_content: content,
    });
    if (error) {
      if (error.code === '40001' || /revision_conflict/i.test(error.message || '')) {
        throw new Error('Устав уже изменён в другой вкладке. Обновите данные из базы.');
      }
      if (/owner_only|permission|policy/i.test(error.message || '')) {
        throw new Error('Сессия владельца истекла. Войдите снова через закрытую ссылку редактора.');
      }
      throw new Error(error.message || 'Не удалось сохранить изменения.');
    }
    const row = Array.isArray(data) ? data[0] : data;
    return normalize(row);
  }

  function subscribe(callback) {
    const channel = client
      .channel('portia-charter-live')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'charter_state',
        filter: 'id=eq.main',
      }, (payload) => callback(normalize(payload.new)))
      .subscribe();
    return () => client.removeChannel(channel);
  }

  window.PortiaSupabase = {
    client,
    ownerEmail: OWNER_EMAIL,
    loadCharter,
    getOwnerSession,
    sendMagicLink,
    saveCharter,
    subscribe,
    signOut: () => client.auth.signOut(),
  };
}());
