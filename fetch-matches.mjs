import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const COMP = process.env.COMPETITION_CODE || 'WC';
const OUTPUT = resolve(process.env.OUTPUT_PATH || './resultados.json');
const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('❌ Falta FOOTBALL_DATA_TOKEN en .env (registrate gratis en https://football-data.org/client/register)');
  process.exit(1);
}

// EN → ES para los 48 seleccionados del Mundial 2026. Match por lowercase del
// campo `name` de football-data. Si aparece un equipo no mapeado, se usa el
// nombre tal cual (útil para detectar mismatches en logs).
const TEAM_MAP = {
  // Grupo A
  'mexico': 'México',
  'south africa': 'Sudáfrica',
  'czechia': 'Chequia',
  'czech republic': 'Chequia',
  'korea republic': 'Corea del Sur',
  'south korea': 'Corea del Sur',
  // Grupo B
  'canada': 'Canadá',
  'bosnia and herzegovina': 'Bosnia y Herzegovina',
  'bosnia-herzegovina': 'Bosnia y Herzegovina',
  'qatar': 'Catar',
  'switzerland': 'Suiza',
  // Grupo C
  'brazil': 'Brasil',
  'morocco': 'Marruecos',
  'haiti': 'Haití',
  'scotland': 'Escocia',
  // Grupo D
  'united states': 'EE. UU.',
  'usa': 'EE. UU.',
  'paraguay': 'Paraguay',
  'turkey': 'Turquía',
  'türkiye': 'Turquía',
  'australia': 'Australia',
  // Grupo E
  'germany': 'Alemania',
  'curaçao': 'Curazao',
  'curacao': 'Curazao',
  'ivory coast': 'Costa de Marfil',
  "cote d'ivoire": 'Costa de Marfil',
  "côte d'ivoire": 'Costa de Marfil',
  'ecuador': 'Ecuador',
  // Grupo F
  'netherlands': 'Países Bajos',
  'japan': 'Japón',
  'sweden': 'Suecia',
  'tunisia': 'Túnez',
  // Grupo G
  'belgium': 'Bélgica',
  'egypt': 'Egipto',
  'iran': 'Irán',
  'islamic republic of iran': 'Irán',
  'new zealand': 'Nueva Zelanda',
  // Grupo H
  'spain': 'España',
  'cape verde': 'Cabo Verde',
  'cape verde islands': 'Cabo Verde',
  'saudi arabia': 'Arabia Saudita',
  'uruguay': 'Uruguay',
  // Grupo I
  'france': 'Francia',
  'senegal': 'Senegal',
  'iraq': 'Irak',
  'norway': 'Noruega',
  // Grupo J
  'argentina': 'Argentina',
  'algeria': 'Argelia',
  'austria': 'Austria',
  'jordan': 'Jordania',
  // Grupo K
  'portugal': 'Portugal',
  'dr congo': 'RD Congo',
  'congo dr': 'RD Congo',
  'democratic republic of congo': 'RD Congo',
  'colombia': 'Colombia',
  'uzbekistan': 'Uzbekistán',
  // Grupo L
  'england': 'Inglaterra',
  'croatia': 'Croacia',
  'panama': 'Panamá',
  'ghana': 'Ghana'
};

// Equipos cuyo nombre EN y ES coinciden: no alertamos como unmapped.
const SAME_IN_BOTH = new Set([
  'paraguay','australia','ecuador','uruguay','senegal',
  'argentina','austria','portugal','colombia','ghana',
  'panama','iran','ecuador'
]);

function mapTeam(name) {
  if (!name) return { name: null, wasMapped: true };
  const key = name.toLowerCase().trim();
  if (TEAM_MAP[key]) return { name: TEAM_MAP[key], wasMapped: true };
  if (SAME_IN_BOTH.has(key)) return { name, wasMapped: true };
  return { name, wasMapped: false };
}

async function fetchMatches() {
  const url = `https://api.football-data.org/v4/competitions/${COMP}/matches`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': TOKEN } });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

function transform(raw) {
  const src = raw.matches || [];
  const unmapped = new Set();
  const matches = src.map(m => {
    const h = mapTeam(m.homeTeam?.name);
    const a = mapTeam(m.awayTeam?.name);
    if (m.homeTeam?.name && !h.wasMapped) unmapped.add(m.homeTeam.name);
    if (m.awayTeam?.name && !a.wasMapped) unmapped.add(m.awayTeam.name);
    const home = h.name;
    const away = a.name;

    const date = m.utcDate ? m.utcDate.slice(0, 10) : null;
    const hs = m.score?.fullTime?.home;
    const as = m.score?.fullTime?.away;
    const isFinished = m.status === 'FINISHED';
    const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
    // Para live: fullTime se actualiza durante el partido con el score actual.
    const showScore = isFinished || isLive;

    return {
      date,
      home,
      away,
      homeScore: showScore ? hs : null,
      awayScore: showScore ? as : null,
      status: m.status,
      minute: isLive ? m.minute ?? null : null,
      utcDate: m.utcDate,
      stage: m.stage
    };
  });

  const finished = matches.filter(m =>
    m.status === 'FINISHED' &&
    typeof m.homeScore === 'number' &&
    typeof m.awayScore === 'number'
  ).map(({ status, minute, utcDate, stage, ...rest }) => rest);

  const live = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');

  return {
    generatedAt: new Date().toISOString(),
    source: 'football-data.org',
    competition: COMP,
    unmappedTeams: Array.from(unmapped),
    matches: finished,
    live
  };
}

(async () => {
  try {
    console.log(`→ GET /v4/competitions/${COMP}/matches`);
    const raw = await fetchMatches();
    const out = transform(raw);
    console.log(`  ${raw.matches?.length ?? 0} partidos totales | ${out.matches.length} FINISHED | ${out.live.length} IN_PLAY`);
    if (out.unmappedTeams.length) {
      console.warn(`  ⚠ equipos sin mapeo EN→ES:`, out.unmappedTeams);
    }

    if (DRY_RUN) {
      console.log('--dry-run: no escribo archivo. Muestra:');
      console.log(JSON.stringify(out, null, 2).slice(0, 800));
      return;
    }

    writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(`✓ Escrito ${OUTPUT}`);
  } catch (e) {
    console.error('✗', e.message);
    process.exit(1);
  }
})();
