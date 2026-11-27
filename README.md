# albertrinehart.com

Personal site for Albert Rinehart. Plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages.

## Structure

```
index.html                     Home: Read / Index views (click anywhere to toggle)
mise/index.html                Mise project page
assets/styles.css              All styles
assets/main.js                 Toggle + renders rides from data/rides.json
assets/powered-by-strava.svg   Official Strava attribution logo (add it, see below)
data/rides.json                Ride data, rewritten daily by the GitHub Action
scripts/fetch-strava.mjs       Pulls rides from the Strava API (Node 20, no dependencies)
.github/workflows/strava.yml   Daily schedule for the Strava sync
CNAME                          Custom domain for GitHub Pages
```

## Preview locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening index.html directly won't load the ride data.)

## Placeholders to fill before launch

- `mise/index.html`: three screenshots in `assets/mise/` (budget.png, accounts.png, reports.png), captured from the iOS Simulator

## Ride stats

The Index view shows miles all time, this year and this week, feet climbed this year and all time, and hours ridden this year. Each recent ride lists its average watts when it was recorded with a power meter. Each number counts up from zero when Index opens (skipped for visitors who turn off motion). Totals come from Strava's athlete stats endpoint, so no historical export is needed.

## Strava sync: one-time setup

1. Create an API application at https://www.strava.com/settings/api
   - Website: `https://albertrinehart.com`
   - Authorization Callback Domain: `localhost`
2. Open this URL in a browser (replace `CLIENT_ID`), approve, and copy the `code` from the address you're sent to:
   ```
   https://www.strava.com/oauth/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read
   ```
   `activity:read` (not `read_all`) keeps "Only You" activities and privacy-zone data out.
3. Exchange the code for a refresh token:
   ```
   curl -X POST https://www.strava.com/oauth/token \
     -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
     -d code=CODE -d grant_type=authorization_code
   ```
4. In the GitHub repo, go to Settings → Secrets and variables → Actions and add:
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`
5. Run the "Sync Strava rides" workflow once from the Actions tab to check it works.

### Strava requirements

- Strava's API Agreement requires its official logos and links where Strava data is shown. Download the "Powered by Strava" logo from https://developers.strava.com/guidelines/ and save it as `assets/powered-by-strava.svg`. Don't modify it.
- Each ride links to its activity with the text "View on Strava", as the brand guidelines require.
- Check https://www.strava.com/legal/api_policy for current subscription requirements.

## Custom domain (Porkbun)

In Porkbun DNS for albertrinehart.com, remove the default parking records, then add:

| Type  | Host | Answer                    |
|-------|------|---------------------------|
| A     | @    | 185.199.108.153           |
| A     | @    | 185.199.109.153           |
| A     | @    | 185.199.110.153           |
| A     | @    | 185.199.111.153           |
| CNAME | www  | GITHUB_USERNAME.github.io |

Then in the repo: Settings → Pages → Custom domain `albertrinehart.com`, and turn on Enforce HTTPS once the certificate is issued.
