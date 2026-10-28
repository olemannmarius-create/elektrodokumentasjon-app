# elektrodokumentasjon-app
Kildekode til dokumentasjonsappen for elektroarbeid og annen dokumentasjon.

Appen kjøres som en statisk nettside uten byggetrinn. Se
[oppsett for innlogging og skylagring](supabase/README.md) før testing mot Supabase.

## Utvikling og tester

Kjør `npm ci` for testverktøyene. Start en lokal server fra repoets rot med
`python3 -m http.server 8080 --bind 127.0.0.1`. Kjør deretter:

- `npm run test:rls` – tester SQL og tilgangsregler i en isolert PGlite-database.
- `npm run test:browser` – tester appen med Playwright og simulerte Supabase-svar.
  Chromium forventes på `/usr/bin/chromium`; bruk `CHROMIUM_PATH` for en annen sti.

Disse testene oppretter ikke reelle Supabase-kontoer og erstatter ikke testen mot
prosjektet som er beskrevet i Supabase-oppsettet.
