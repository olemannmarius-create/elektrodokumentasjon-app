// Requires Playwright and Chromium. Run with a local HTTP server on port 8080.
// Uses the actual browser SDK against a simulated API; no real accounts or mail.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:8080/';
const api = 'https://bfaciiiknhxptoeulaht.supabase.co';
const users = {
  'one@example.test': { id: '11111111-1111-4111-8111-111111111111', email: 'one@example.test' },
  'two@example.test': { id: '22222222-2222-4222-8222-222222222222', email: 'two@example.test' }
};
const expires = Math.floor(Date.now()/1000) + 3600;
const token = user => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url'), 'test-signature'].join('.');
const session = user => ({ access_token: token(user), token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh', user });
let rows = [], failInsert = false, missingTable = false;

async function mock(context) {
  await context.route(api + '/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const body = request.postDataJSON();
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS') return respond({});
    if (url.pathname.endsWith('/token')) {
      if (body.password !== 'test-password') return respond({ msg: 'Invalid login credentials' }, 400);
      return respond(session(users[body.email]));
    }
    if (url.pathname.endsWith('/signup')) return respond({ user: users[body.email], session: null });
    if (url.pathname.endsWith('/logout') || url.pathname.endsWith('/recover')) return respond({});
    const auth = request.headers().authorization;
    const user = Object.values(users).find(u => auth === 'Bearer ' + token(u));
    if (url.pathname.endsWith('/user')) return respond(user || {}, user ? 200 : 401);
    if (!user) return respond({ message: 'unauthorized' }, 401);
    if (missingTable) return respond({ code: 'PGRST205', message: 'missing table' }, 404);
    if (request.method() === 'POST') {
      if (failInsert) return respond({ message: 'Test: saving failed' }, 500);
      assert.equal(body.owner_id, user.id);
      rows.push({ ...body, id: String(rows.length + 1), created_at: new Date().toISOString() });
      return respond({}, 201);
    }
    let visible = rows.filter(r => r.owner_id === user.id);
    if (url.searchParams.has('id')) visible = visible.filter(r => 'eq.' + r.id === url.searchParams.get('id'));
    if (request.method() === 'DELETE') {
      rows = rows.filter(r => !visible.includes(r)); return respond({});
    }
    if (request.headers().accept?.includes('vnd.pgrst.object')) return respond(visible[0]);
    return respond(visible.map(({ id, kind, title, created_at }) => ({ id, kind, title, created_at })));
  });
}

async function ready(page) {
  await page.goto(base);
  await page.waitForFunction(() => window.appStorageReady);
  await page.waitForFunction(() => !document.getElementById('cloudLoginForm').hidden);
  assert.equal(await page.locator('#cloudLoginForm').isVisible(), false);
  await page.locator('#cloudHeading').click();
  assert.equal(await page.locator('#cloudLoginForm').isVisible(), true);
  await page.locator('#cloudHeading').click();
  assert.equal(await page.locator('#cloudLoginForm').isVisible(), false);
  await page.locator('#cloudHeading').click();
}
async function login(page, email) {
  await page.locator('#cloudEmail').fill(email);
  await page.locator('#cloudPassword').fill('test-password');
  await page.locator('#cloudLoginForm button[type=submit]').click();
  await page.waitForFunction(() => !document.getElementById('cloudSignedIn').hidden);
  await page.waitForFunction(() => !document.getElementById('cloudRefresh').disabled);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await mock(context);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    await ready(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#cloudEmail').fill('one@example.test');
    await page.locator('#cloudPassword').fill('wrong-password');
    await page.locator('#cloudLoginForm button[type=submit]').click();
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent.includes('Feil e-post'));
    assert.equal(await page.locator('#cloudPassword').inputValue(), '');
    await page.locator('#cloudPassword').fill('test-password');
    await page.locator('#cloudSignUp').click();
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent.includes('bekreftelsesmelding'));
    await login(page, 'one@example.test');
    const originalDraft = await page.evaluate(() => {
      D.title = 'Test <img src=x onerror=alert(1)>';
      document.getElementById('reportTitle').value = D.title;
      D.common.address = 'Testveien 1'; fillUI();
      D.attachments = [{ id: uid(), name: 'test.pdf', data: 'data:application/pdf;base64,JVBERi0=' }];
      followUpData['electro:' + D.id] = { info: [{ id: uid(), text: 'Testnotat', done: false }] };
      return D.id;
    });
    await page.locator('#cloudSaveElectro').click();
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent.startsWith('Skykopien er lagret.'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload.followUps.info[0].text, 'Testnotat');
    assert.equal(rows[0].payload.record.attachments[0].name, 'test.pdf');
    assert.equal(await page.locator('#cloudDocuments img').count(), 0);
    // Exported standalone HTML must not contain auth controls or tokens.
    const standalone = await page.evaluate(() => standaloneDocumentHTML());
    assert(!standalone.includes('id="cloudAccount"'));
    assert.equal(await page.evaluate(source => new DOMParser().parseFromString(source, 'text/html').querySelectorAll('script[data-cloud-script]').length, standalone), 0);
    assert(!standalone.includes('test-refresh'));
    const second = await browser.newContext(); await mock(second);
    const other = await second.newPage(); other.on('dialog', d => d.accept());
    await ready(other); await login(other, 'two@example.test');
    assert.equal(await other.locator('#cloudDocuments .savedItem').count(), 0);
    await other.locator('#cloudSignOut').click();
    await other.waitForFunction(() => !document.getElementById('cloudLoginForm').hidden);
    await login(other, 'one@example.test');
    assert.equal(await other.locator('#cloudDocuments .savedItem').count(), 1);
    const secondDraft = await other.evaluate(() => D.id);
    await other.getByRole('button', { name: 'Hent lokal kopi' }).click();
    await other.waitForFunction(() => savedCache.length === 1);
    const imported = await other.evaluate(() => ({ id: D.id, saved: savedCache[0], notes: followUpBucket('electro', savedCache[0].id) }));
    assert.equal(imported.id, secondDraft);
    assert.notEqual(imported.saved.id, originalDraft);
    assert.equal(imported.notes.info[0].text, 'Testnotat');
    assert.equal(imported.saved.attachments[0].name, 'test.pdf');
    await page.evaluate(() => { G.title = 'General test'; G.groups = [{ id: uid(), title: 'Room', items: [{ id: uid(), type: 'image', name: 'image.png', data: 'data:image/png;base64,dGVzdA==' }] }]; });
    await page.locator('#cloudSaveGeneral').click();
    await page.waitForFunction(() => !document.getElementById('cloudSaveGeneral').disabled);
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent.startsWith('Skykopien er lagret.'));
    assert.equal(rows.length, 2);
    await other.locator('#cloudRefresh').click();
    await other.waitForFunction(() => document.querySelectorAll('#cloudDocuments .savedItem').length === 2);
    await other.locator('#cloudDocuments .savedItem').filter({ hasText: 'General test' }).getByRole('button', { name: 'Hent lokal kopi' }).click();
    await other.waitForFunction(() => generalArchive.length === 1);
    assert.equal(await other.evaluate(() => generalArchive[0].groups[0].items[0].name), 'image.png');
    failInsert = true;
    await page.locator('#cloudSaveGeneral').click();
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent.includes('Test: saving failed'));
    assert.equal(rows.length, 2); failInsert = false;
    missingTable = true;
    await page.locator('#cloudRefresh').click();
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent.includes('SQL Editor'));
    missingTable = false;
    await page.locator('#cloudRefresh').click();
    await page.waitForFunction(() => !document.getElementById('cloudRefresh').disabled);
    await page.locator('#cloudDocuments .savedItem').first().getByRole('button', { name: 'Slett skykopi' }).click();
    await page.waitForFunction(() => document.getElementById('cloudStatus').textContent === 'Skykopien er slettet.');
    assert.equal(rows.length, 1);
    await page.locator('#cloudSignOut').click();
    await page.waitForFunction(() => !document.getElementById('cloudLoginForm').hidden);
    assert.equal(await page.locator('#cloudDocuments .savedItem').count(), 0);
    assert.equal(await page.evaluate(() => D.id), originalDraft);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('elektro-cloud-auth')), null);
    assert.deepEqual(errors, []);
    console.log('PASS: mobile layout, signup/login, two accounts/devices, both document kinds, attachments/notes, immutable copies, failed saves, missing schema, delete, logout, export privacy. API responses are simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
