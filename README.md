# mundial-live-scores

Fetcher que llama a **football-data.org** y sirve `resultados.json` público via GitHub Actions + raw.githubusercontent.com — sin server propio y con CORS abierto.

## Deploy en GitHub (opción C)

**1. Crear repo público nuevo**
```bash
cd automations/mundial-live-scores
git init && git add . && git commit -m "init: mundial live scores fetcher"
# Con gh CLI (recomendado):
gh repo create tn8-mundial-scores --public --source=. --push
# O manualmente: crear repo en github.com → git remote add origin ... → git push -u origin main
```

**2. Agregar el token como Secret**
En `https://github.com/<tu-usuario>/tn8-mundial-scores/settings/secrets/actions/new`:
- Nombre: `FOOTBALL_DATA_TOKEN`
- Value: (pegá tu token)

**3. Verificar**
- El workflow corre automático cada 5 min (mínimo de GitHub Actions).
- También podés dispararlo manual en Actions → "Fetch Mundial 2026 scores" → Run workflow.
- El `resultados.json` se commitea al repo tras cada corrida.

**4. Actualizar `RESULTS_URL` en el snippet**
En `wordpress-snippet.html` cambiá:
```js
if (location.hostname.indexOf('tn8.ni') !== -1) {
  return 'https://raw.githubusercontent.com/<tu-usuario>/tn8-mundial-scores/main/resultados.json';
}
```
raw.githubusercontent.com incluye headers CORS y cachea ~5 min — el cache-buster `?t=<ts>` del fetch ya está en el código.

**5. Activar polling**
Descomentar en el snippet las 3 líneas del bloque MODO MANUAL (final del bloque de RESULTS):
```js
fetchResults();
setInterval(fetchResults, RESULTS_POLL_MS);
setInterval(updateStatusText, 1000);
```

## Testing local (previo al deploy)

```bash
cp .env.example .env
# → editar .env: pegar tu FOOTBALL_DATA_TOKEN
npm install
node fetch-matches.mjs --dry-run   # prueba sin escribir archivo
node fetch-matches.mjs              # genera resultados.json local
```

## Formato de salida

```json
{
  "generatedAt": "2026-07-07T21:05:00.000Z",
  "source": "football-data.org",
  "competition": "WC",
  "unmappedTeams": [],
  "matches": [
    { "date": "2026-06-11", "home": "México", "away": "Sudáfrica", "homeScore": 2, "awayScore": 0 }
  ],
  "live": [
    { "date": "2026-07-09", "home": "Francia", "away": "Marruecos", "status": "IN_PLAY", "minute": 34 }
  ]
}
```

- `matches[]` — sólo partidos **FINISHED**, consumidos por el polling actual del HTML.
- `live[]` — partidos IN_PLAY / PAUSED con minuto. Para futuras iteraciones de UI en vivo.
- `unmappedTeams[]` — si aparece algún nombre no mapeado en `TEAM_MAP`, se lista acá.

## Activar el polling en la landing

En `wordpress-snippet.html` hay 3 líneas comentadas al final del bloque MODO MANUAL. Descomentar:

```js
fetchResults();
setInterval(fetchResults, RESULTS_POLL_MS);
setInterval(updateStatusText, 1000);
```

Con eso el JSON reemplaza al array `RESULTS` manual cada 60s.
