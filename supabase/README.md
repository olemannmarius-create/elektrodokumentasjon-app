# Klargjør skylagring

Dette er en første test av innlogging og manuelle skykopier. Automatisk lagring
og vanlige lagreknapper lagrer fortsatt lokalt. En skykopi inneholder også bilder,
PDF-vedlegg og huskepunkter. Hver skylagring lager en ny kopi; eksisterende kopier
endres ikke. Henting legger en ny kopi i det lokale arkivet uten å erstatte utkast.
Bruk eksempeldata uten kundeopplysninger til oppsettet er kontrollert.

1. Åpne prosjektet `bfaciiiknhxptoeulaht` i Supabase.
2. Velg **SQL Editor**, opprett en ny spørring, lim inn hele innholdet i
   [setup.sql](setup.sql), og trykk **Run**. Skriptet kan kjøres igjen.
3. Under **Authentication → URL Configuration**, sett **Site URL** og legg til
   følgende under **Redirect URLs**:
   `https://olemannmarius-create.github.io/elektrodokumentasjon-app/`
4. Under **Authentication → Sign In / Providers → Email**, kontroller at e-post
   og passord er aktivert, og behold e-postbekreftelse aktivert.
5. Åpne appen, velg **Opprett konto**, bekreft e-posten og logg inn.
6. Lag en testrapport og trykk **Lagre ny skykopi av rapport**.
7. Logg inn med samme konto på en annen enhet. Velg **Hent lokal kopi**, og
   åpne den under **Lagrede rapporter**. Test også annen dokumentasjon, bilder,
   vedlegg og huskepunkter.
8. Med en annen konto skal listen være tom. Uten innlogging skal tabellen ikke
   være tilgjengelig. Kontroller dette før bruk med faktiske kundedata.

SQL-en gir bare innloggede brukere tilgang til egne rader. Den offentlige
publishable-nøkkelen i `cloud.js` gir ingen administratortilgang. Aldri legg inn
databasepassord eller en `service_role`/secret-nøkkel i appkoden.

Innlogging bruker Supabase SDK og sesjonslagring i nettleseren. Logg ut på delte
enheter. Lokale kopier blir liggende etter utlogging, slik de gjorde før.
HTML-eksport inneholder ikke innloggingspanelet, skylister eller innloggingstoken.

En skykopi er begrenset til 10 MB. Dette er ikke automatisk synkronisering eller
en full sikkerhetskopiløsning; behold egne JSON-sikkerhetskopier. Supabases
gratisplan har egne grenser og begrensninger på utsending av e-post.
