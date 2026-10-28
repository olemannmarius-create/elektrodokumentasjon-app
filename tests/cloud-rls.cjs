// Exercises actual PostgreSQL RLS in an isolated in-memory PGlite database.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const one = '11111111-1111-4111-8111-111111111111';
const two = '22222222-2222-4222-8222-222222222222';
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      INSERT INTO auth.users VALUES ('${one}'),('${two}');
    `);
    const sql = fs.readFileSync('supabase/setup.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    const asUser = async id => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`);
    const insert = owner => db.query(`INSERT INTO public.electro_cloud_documents(owner_id,kind,title,payload) VALUES ($1,'electro','test',$2) RETURNING id`, [owner, { version: 1, kind: 'electro', record: { title: 'test' } }]);
    await asUser(one);
    const first = (await insert(one)).rows[0].id;
    await assert.rejects(() => insert(two), /row-level security/);
    assert.equal((await db.query('SELECT * FROM public.electro_cloud_documents')).rows.length, 1);
    await assert.rejects(() => db.query("UPDATE public.electro_cloud_documents SET title='changed'"), /permission denied/);
    await asUser(two);
    assert.equal((await db.query('SELECT * FROM public.electro_cloud_documents')).rows.length, 0);
    assert.equal((await db.query('DELETE FROM public.electro_cloud_documents WHERE id=$1 RETURNING id', [first])).rows.length, 0);
    await insert(two);
    assert.equal((await db.query('SELECT * FROM public.electro_cloud_documents')).rows.length, 1);
    await assert.rejects(() => db.query(`INSERT INTO public.electro_cloud_documents(kind,title,payload) VALUES ('electro','bad','{"version":1,"kind":"general","record":{}}')`), /check constraint/);
    await assert.rejects(() => db.query(`INSERT INTO public.electro_cloud_documents(kind,title,payload) VALUES ('electro','bad','{"version":1,"record":{}}')`), /check constraint/);
    await db.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(() => db.query('SELECT * FROM public.electro_cloud_documents'), /permission denied/);
    await assert.rejects(() => insert(one), /permission denied/);
    await asUser(one);
    assert.equal((await db.query('DELETE FROM public.electro_cloud_documents WHERE id=$1 RETURNING id', [first])).rows.length, 1);
    console.log('PASS: SQL repeatability, own rows, cross-account read/insert/delete denial, anonymous denial, immutable copies, payload constraints. Local PostgreSQL simulation; not the live Supabase project.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
