// Pulls recent rides and yearly totals from the Strava API and writes data/rides.json.
// Runs daily in GitHub Actions. Needs three repository secrets:
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
// Requires Node 20+ (built-in fetch). No dependencies.
//
// Privacy: only names, dates, distance, elevation, moving time and power are saved.
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

// Best average power over any 20-minute (1,200-second) stretch of a ride.
// `time` is seconds from the start and `watts` the power at each of those seconds. Devices often
// record every few seconds, so a gap of up to 10 s keeps the previous reading; longer gaps (stops,
// auto-pause) count as 0 W. Returns null for rides shorter than 20 minutes.
const WINDOW_S = 1200;
const MAX_FILL_S = 10;
function best20MinWatts(time, watts) {
  if (!Array.isArray(time) || !Array.isArray(watts) || time.length !== watts.length || time.length === 0) return null;
  const length = time[time.length - 1] + 1;
  if (length < WINDOW_S) return null;
  const perSecond = new Float64Array(length);
  for (let i = 0; i < time.length; i++) {
    const w = Number(watts[i]) || 0;
    const next = i + 1 < time.length ? time[i + 1] : time[i] + 1;
    const until = next - time[i] <= MAX_FILL_S ? next : time[i] + 1;
    for (let t = time[i]; t < until; t++) perSecond[t] = w;
  }
  let sum = 0;
  for (let t = 0; t < WINDOW_S; t++) sum += perSecond[t];
  let best = sum;
  for (let t = WINDOW_S; t < length; t++) {
    sum += perSecond[t] - perSecond[t - WINDOW_S];
    if (sum > best) best = sum;
  }
  return round(best / WINDOW_S);
}

// Downloads only the power and time streams (no GPS) for one ride.
async function best20ForActivity(id, token) {
  try {
    const streams = await api('/activities/' + id + '/streams?keys=watts,time&key_by_type=true', token);
    return best20MinWatts(streams.time?.data, streams.watts?.data);
  } catch (err) {
    console.warn('Could not get power for activity ' + id + ': ' + err.message);
    return null;
  }
}

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
    ytd_hours: round((ytd.moving_time || 0) / 3600),
    all_miles: round((all.distance || 0) / METERS_PER_MILE),
    all_elevation_ft: round((all.elevation_gain || 0) * FEET_PER_METER),
    all_rides: all.count || 0,
    recent: rides.slice(0, 10).map((a) => ({
      id: a.id,
      name: a.name,
      date: a.start_date,
      miles: round(a.distance / METERS_PER_MILE, 1),
      elevation_ft: round(a.total_elevation_gain * FEET_PER_METER),
      moving_time_s: a.moving_time,
      // Only rides measured by a power meter; Strava's estimated watts are left out.
      avg_watts: a.device_watts && a.average_watts ? round(a.average_watts) : null,
      type: a.sport_type || a.type,
    })),
  };

  // Best 20-minute power, one ride at a time, only for rides recorded with a power meter.
  for (const [i, a] of rides.slice(0, 10).entries()) {
    output.recent[i].best20_watts = a.device_watts ? await best20ForActivity(a.id, access_token) : null;
  }

  await mkdir('data', { recursive: true });
  await writeFile('data/rides.json', JSON.stringify(output, null, 2) + '\n');
  console.log(`Saved ${output.recent.length} rides. This week: ${output.week_miles} mi. YTD: ${output.ytd_miles} mi. All time: ${output.all_miles} mi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
