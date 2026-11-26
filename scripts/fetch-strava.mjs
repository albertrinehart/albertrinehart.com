// Pulls recent rides and yearly totals from the Strava API and writes data/rides.json.
// Runs daily in GitHub Actions. Needs three repository secrets:
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
// Requires Node 20+ (built-in fetch). No dependencies.
//
// Privacy: only names, dates, distance, elevation and moving time are saved.
// No GPS tracks, map polylines or start/end coordinates are written to the site.

import { writeFile, mkdir } from 'node:fs/promises';

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  console.error('Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET or STRAVA_REFRESH_TOKEN.');
  process.exit(1);
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const RIDE_TYPES = new Set(['Ride', 'GravelRide', 'MountainBikeRide', 'VirtualRide', 'EBikeRide', 'Velomobile']);
const TZ = 'America/New_York';

async function getAccessToken() {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error('Token refresh failed: ' + res.status + ' ' + (await res.text()));
  const json = await res.json();
  if (json.refresh_token && json.refresh_token !== STRAVA_REFRESH_TOKEN) {
    // Strava can rotate refresh tokens. If this appears in the logs, update the repo secret.
    console.warn('Strava issued a new refresh token. Update the STRAVA_REFRESH_TOKEN secret.');
  }
  return json;
}

async function api(path, token) {
  const res = await fetch('https://www.strava.com/api/v3' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error(path + ' failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}

// Monday 00:00 of the current week in New York, as a Date.
function startOfWeekNY(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(now).map((p) => [p.type, p.value])
  );
  const dayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const localMidnight = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  localMidnight.setDate(localMidnight.getDate() - dayIndex);
  return localMidnight; // compared against start_date_local below, which is also wall-clock time
}

const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

async function main() {
  const { access_token, athlete } = await getAccessToken();
  const athleteId = athlete?.id ?? (await api('/athlete', access_token)).id;

  const [activities, stats] = await Promise.all([
    api('/athlete/activities?per_page=60', access_token),
    api('/athletes/' + athleteId + '/stats', access_token),
  ]);

  const rides = activities.filter((a) => RIDE_TYPES.has(a.sport_type || a.type));

  const weekStart = startOfWeekNY();
  const weekMeters = rides
    .filter((a) => new Date(a.start_date_local.replace('Z', '')) >= weekStart)
    .reduce((sum, a) => sum + a.distance, 0);

  const ytd = stats.ytd_ride_totals || {};
  const all = stats.all_ride_totals || {};

  const output = {
    updated_at: new Date().toISOString(),
    week_miles: round(weekMeters / METERS_PER_MILE),
    ytd_miles: round((ytd.distance || 0) / METERS_PER_MILE),
    ytd_elevation_ft: round((ytd.elevation_gain || 0) * FEET_PER_METER),
    ytd_rides: ytd.count || 0,
    all_miles: round((all.distance || 0) / METERS_PER_MILE),
    all_rides: all.count || 0,
    recent: rides.slice(0, 10).map((a) => ({
      id: a.id,
      name: a.name,
      date: a.start_date,
      miles: round(a.distance / METERS_PER_MILE, 1),
      elevation_ft: round(a.total_elevation_gain * FEET_PER_METER),
      moving_time_s: a.moving_time,
      type: a.sport_type || a.type,
    })),
  };

  await mkdir('data', { recursive: true });
  await writeFile('data/rides.json', JSON.stringify(output, null, 2) + '\n');
  console.log(`Saved ${output.recent.length} rides. This week: ${output.week_miles} mi. YTD: ${output.ytd_miles} mi. All time: ${output.all_miles} mi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
