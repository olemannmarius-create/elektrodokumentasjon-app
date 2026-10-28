/* Cloud copies are opt-in. Local drafts remain independent of authentication. */
(() => {
  'use strict';
  const URL = 'https://bfaciiiknhxptoeulaht.supabase.co';
  // A publishable browser key, never a service-role key. Access is enforced by RLS.
  const KEY = 'sb_publishable_ktZ7C78JYEfTovgN4CCX2A_1MXowAOP';
  const TABLE = 'electro_cloud_documents';
  const MAX_BYTES = 10 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  let client, user = null, busy = false, recovery = false;
  const message = text => { $('cloudStatus').textContent = text; };

  function explain(error) {
    if (['PGRST205', '42P01', '42501'].includes(error?.code)) {
      return 'Databasen er ikke klargjort. Kjør oppsettet i supabase/setup.sql i Supabase SQL Editor først.';
    }
    if (error?.message === 'Invalid login credentials') return 'Feil e-post eller passord. Har du opprettet konto og bekreftet e-posten?';
    if (error?.message === 'Email not confirmed') return 'Bekreft e-posten før du logger inn.';
    if (/fetch|network/i.test(error?.message || '')) return 'Kunne ikke kontakte Supabase. Kontroller nettet og prøv igjen. Ingen skykopi er bekreftet lagret.';
    return error?.message || 'Handlingen mislyktes. Prøv igjen.';
  }

  function controls() {
    $('cloudAccount').querySelectorAll('button,input').forEach(el => { el.disabled = busy; });
  }

  function renderSession(session) {
    const next = session?.user || null;
    if (user?.id !== next?.id) $('cloudDocuments').replaceChildren();
    user = next;
    if (!user) recovery = false;
    $('cloudLoginForm').hidden = !!user;
    $('cloudSignedIn').hidden = !user || recovery;
    $('cloudRecoveryForm').hidden = !user || !recovery;
    $('cloudUser').textContent = user ? 'Logget inn som ' + user.email : '';
  }

  async function run(action) {
    if (busy) return;
    busy = true; controls();
    try { await action(); }
    catch (error) { message(explain(error)); }
    finally { busy = false; controls(); }
  }

  async function requireUser() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.id !== user?.id) throw error || new Error('Logg inn på nytt før du fortsetter.');
    return data.user.id;
  }

  async function listDocuments() {
    const owner = await requireUser();
    const { data, error } = await client.from(TABLE)
      .select('id,kind,title,created_at').eq('owner_id', owner)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    if (user?.id !== owner) return;
    const host = $('cloudDocuments');
    host.replaceChildren();
    if (!data.length) {
      const p = document.createElement('p');
      p.textContent = 'Ingen skykopier ennå. Åpne et dokument og velg «Lagre ny skykopi».';
      host.append(p);
    }
    for (const row of data) {
      const card = document.createElement('div'); card.className = 'savedItem';
      const title = document.createElement('h3'); title.textContent = row.title || 'Uten navn';
      const info = document.createElement('p');
      info.textContent = (row.kind === 'electro' ? 'Elektro' : 'Annen dokumentasjon') + ' · ' + new Date(row.created_at).toLocaleString('nb-NO');
      const bar = document.createElement('div'); bar.className = 'bar';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'btn'; open.textContent = 'Hent lokal kopi';
      open.addEventListener('click', () => run(async () => {
        message('Henter dokument …');
        const current = await requireUser();
        const { data: documentRow, error: loadError } = await client.from(TABLE)
          .select('kind,payload').eq('id', row.id).eq('owner_id', current).single();
        if (loadError) throw loadError;
        if (user?.id !== current) throw new Error('Innloggingen ble endret. Prøv igjen.');
        if (documentRow.payload?.kind !== documentRow.kind) throw new Error('Skykopien har ugyldig dokumenttype.');
        await window.cloudBridge.importCopy(documentRow.payload);
        message('En ny lokal kopi er lagt i «Lagrede rapporter» eller «Lagrede prosjekter». Åpne den der for å fortsette. Eksisterende utkast er beholdt.');
      }));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn danger'; remove.textContent = 'Slett skykopi';
      remove.addEventListener('click', () => run(async () => {
        if (!confirm('Slette denne skykopien? Lokale dokumenter beholdes.')) return;
        const current = await requireUser();
        const { error: deleteError } = await client.from(TABLE).delete().eq('id', row.id).eq('owner_id', current);
        if (deleteError) throw deleteError;
        await listDocuments(); message('Skykopien er slettet.');
      }));
      bar.append(open, remove); card.append(title, info, bar); host.append(card);
    }
    message('Viser ' + data.length + ' skykopier' + (data.length === 100 ? ' (de 100 nyeste)' : '') + '.');
    controls();
  }

  async function saveCopy(kind) {
    message('Klargjør skykopi …');
    const owner = await requireUser();
    const payload = await window.cloudBridge.snapshot(kind);
    if (new Blob([JSON.stringify(payload)]).size > MAX_BYTES) throw new Error('Dokumentet er større enn 10 MB. Bruk færre vedlegg eller JSON-sikkerhetskopi.');
    if (!confirm('Lagre en ny skykopi av «' + (payload.record.title || 'Uten navn') + '», inkludert bilder, vedlegg og huskepunkter?')) {
      message('Lagring av skykopi ble avbrutt. Dokumentet er fortsatt lokalt.'); return;
    }
    message('Lagrer skykopi …');
    const { error } = await client.from(TABLE).insert({
      owner_id: owner, kind, title: String(payload.record.title || 'Uten navn').slice(0, 200), payload
    });
    if (error) throw error;
    // A list failure must not turn a confirmed insert into a misleading save failure.
    try { await listDocuments(); message('Skykopien er lagret. Du kan hente den på en annen enhet med samme konto.'); }
    catch (listError) { message('Skykopien er lagret, men listen kunne ikke oppdateres. ' + explain(listError)); }
  }

  async function init() {
    if (document.getElementById('embedded-report')) { $('cloudAccount')?.remove(); return; }
    if (!window.supabase) { message('Innlogging kunne ikke lastes. Last siden på nytt. Lokal lagring fungerer fortsatt.'); return; }
    try {
      client = window.supabase.createClient(URL, KEY, {
        auth: { storage: window.sessionStorage, storageKey: 'elektro-cloud-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') { recovery = true; $('cloudAccount').open = true; }
        renderSession(session);
        if (event === 'SIGNED_OUT') message('Du er logget ut. Lokale dokumenter er fortsatt på denne enheten.');
        if (event === 'PASSWORD_RECOVERY') message('Velg et nytt passord nedenfor.');
      });

      $('cloudLoginForm').addEventListener('submit', e => {
        e.preventDefault(); run(async () => {
          message('Logger inn …');
          const { data, error } = await client.auth.signInWithPassword({ email: $('cloudEmail').value.trim(), password: $('cloudPassword').value });
          $('cloudPassword').value = '';
          if (error) throw error;
          renderSession(data.session); await listDocuments();
        });
      });
      $('cloudSignUp').addEventListener('click', () => {
        if (!$('cloudLoginForm').reportValidity()) return;
        run(async () => {
          if ($('cloudPassword').value.length < 8) throw new Error('Bruk minst 8 tegn i passordet.');
          message('Oppretter konto …');
          const { data, error } = await client.auth.signUp({
            email: $('cloudEmail').value.trim(), password: $('cloudPassword').value,
            options: { emailRedirectTo: location.origin + location.pathname }
          });
          $('cloudPassword').value = '';
          if (error) throw error;
          if (data.session) { renderSession(data.session); await listDocuments(); }
          else message('Se etter en bekreftelsesmelding i e-posten din, også i søppelpost. Bekreft kontoen og logg inn her.');
        });
      });
      $('cloudResetPassword').addEventListener('click', () => {
        if (!$('cloudEmail').reportValidity()) return;
        run(async () => {
          const { error } = await client.auth.resetPasswordForEmail($('cloudEmail').value.trim(), { redirectTo: location.origin + location.pathname });
          if (error) throw error;
          message('Hvis kontoen finnes, får du en e-post med lenke for å velge nytt passord.');
        });
      });
      $('cloudRecoveryForm').addEventListener('submit', e => {
        e.preventDefault(); run(async () => {
          const { error } = await client.auth.updateUser({ password: $('cloudNewPassword').value });
          $('cloudNewPassword').value = '';
          if (error) throw error;
          recovery = false;
          const { data } = await client.auth.getSession(); renderSession(data.session);
          message('Passordet er oppdatert.');
        });
      });
      $('cloudSignOut').addEventListener('click', () => run(async () => {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        renderSession(null);
        $('cloudPassword').value = ''; $('cloudNewPassword').value = '';
        message('Du er logget ut. Lokale dokumenter er fortsatt på denne enheten.');
      }));
      $('cloudSaveElectro').addEventListener('click', () => run(() => saveCopy('electro')));
      $('cloudSaveGeneral').addEventListener('click', () => run(() => saveCopy('general')));
      $('cloudRefresh').addEventListener('click', () => run(listDocuments));
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      renderSession(data.session);
      if (recovery) message('Velg et nytt passord nedenfor.');
      else if (user) await run(listDocuments);
      else message('Ikke logget inn. Du kan fortsatt bruke appen med lokal lagring.');
    } catch (error) { message(explain(error)); }
  }
  if (window.appStorageReady) init();
  else window.addEventListener('app-storage-ready', init, { once: true });
})();
