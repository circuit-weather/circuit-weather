# TheSportsDB data checklist

Every series except Formula 1 gets its schedule from [TheSportsDB](https://www.thesportsdb.com/)
(`/api/schedule/{series}`, see `src/handlers/schedule.js` and `src/thesportsdb.js`). This is the
list of TheSportsDB fields the app reads and what each one needs to be. Use it when auditing or
fixing a league's data, and when adding a new series.

The leagues in use are listed in `SERIES` in `src/thesportsdb.js`.

## League (once per league)

- [ ] **`strCurrentSeason`** is the current season, e.g. `2026`. The Worker falls back to the season
      of the latest finished event (`eventspastleague.php`), but only once a round has been run.
- [ ] **Next season is set up early.** Before the opener, next year's events exist with the right
      `strSeason` and round numbers. Otherwise the series shows no schedule over the off-season.

## Rounds

- [ ] **`intRound` starts at 1 with no gaps.** The Worker walks rounds 1, 2, 3… and treats the first
      empty round as the end of the season, so a missing round number cuts off every round after it.
- [ ] **Every session of a weekend has the same `intRound`.** A practice filed under another round
      shows up in that round's session list.
- [ ] **Non-championship events** (tests, the Roar, exhibition races) use round `0` or `500`, so
      they are ignored.
- [ ] **No more than 40 rounds** (`MAX_ROUNDS` in `src/handlers/schedule.js`). NASCAR (36) is the
      closest.
- [ ] **`strSeason`** on every event is the season it belongs to. The Worker uses this to ignore next
      season's opener when working out the next round.

## Events (each session)

### `strEvent` naming

Every session in a round starts with the same round name, followed by the session name, e.g.
`6 Hours of Spa Francorchamps Free Practice 1`.

- [ ] The race itself is named with just the round name (e.g. `6 Hours of Spa Francorchamps`).
      Otherwise the last session by time is taken as the race.
- [ ] The round name is written the same way on every session. A misspelt or differently written
      one shortens the race name the app shows, because only the shared leading words are kept.
      Watch for spelling, word order and extra words; accents don't matter (`Montreal` matches
      `Montréal`).
- [ ] Session names are unique within a round. Duplicates show up as `practice-2`.
- [ ] Session names are consistent across the season (e.g. always `Free Practice 1`). They become
      the URL session ids (`/motogp/2/free-practice-1`).

### Times

- [ ] **`strTimestamp`** is the real start time in **UTC**.
  - `00:00:00` is TheSportsDB's usual placeholder for an unknown time. Replace it unless the
    session really starts at midnight UTC (possible for Australian and Asian rounds).
  - A missing timestamp leaves the session with a date only, so the countdown and
    "minutes before" labels don't work for it.
- [ ] **`dateEvent`** is the same UTC date as `strTimestamp`. It is only used when the timestamp is
      missing.

### Venue

- [ ] **`idVenue`** is the real venue ID on **every** event in the round.
  - Not `0`, `1` or blank. MotoGP and IndyCar have used `1` as a placeholder on most events.
  - The same venue on every session of a weekend (WEC Monza 2026 had one practice pointing at
    Bahrain).
  - For circuits F1 also uses, the **same venue ID as the F1 events**. Track outlines are matched by
    venue ID (`VENUE_CIRCUIT_MAP` in `src/thesportsdb.js`), so a duplicate venue record (e.g.
    MotoGP's `32222` for Interlagos) gets no outline.
- [ ] **`strVenue`** and **`strCountry`** are correct (e.g. no `Autdromo` typos). They are only used
      when the venue lookup is missing.

## Venues (each `idVenue`, via `lookupvenue.php`)

- [ ] **`strMap`** holds the circuit's coordinates. Without them the map can't centre on the circuit
      and has no weather radar or forecast for it. Either format works:
  - degrees/minutes/seconds: `37°50′59″S 144°58′6″E`
  - decimal: `-37.85, 144.97`
- [ ] **`strVenue`** is the circuit name shown in the sidebar.
- [ ] **`strLocation`** is the town or city.
- [ ] **`strCountry`** is one of the country names the app has a flag for (`COUNTRY_CODES` in
      `public/src/config.js`). A name that isn't listed shows no flag; add it to `COUNTRY_CODES`
      (a code change, not a TheSportsDB fix). Flags are loaded from
      `https://flagcdn.com/w80/{code}.png`, so the code must be one flagcdn serves.

## When fixes show up

The Worker keeps everything it fetches and refreshes it on its own schedule
(`getRoundTtlMs` and `VENUE_TTL_MS` in `src/handlers/schedule.js`):

| What changed on TheSportsDB | When the Worker re-reads it |
| --- | --- |
| Session times, names or venue IDs | Hourly during a race weekend (3 days before to 1 day after), daily for upcoming rounds, monthly for finished rounds |
| An event's venue ID changed to a venue the Worker hasn't seen | Looked up straight after that round is re-read |
| Coordinates (`strMap`) of a venue already fetched | Up to 90 days |
| The league's current season | Daily |

After that, the Worker's response cache holds a complete schedule for 15 minutes, and each visitor's
browser keeps it for up to 7 days.

To apply fixes sooner, increase `STATE_VERSION` in `src/handlers/schedule.js` by one and deploy.
The Worker then discards its saved data for every series and fetches it all again. That takes a few
minutes of requests and doesn't clear browser caches.

## Adding a new series

1. Find the league ID (`all_leagues.php`, or `lookupleague.php?id=…`) and check its data against
   this list.
2. Add it to `SERIES` in `src/thesportsdb.js` (`f1Layouts: true` only if it races the F1 layout at
   the venues it shares with F1).
3. Add the id to `SERIES_IDS` in `public/src/config.js`, an `<option>` in `#seriesSelect` in
   `public/index.html`, and a `controls.<id>` label in every locale in `public/src/i18n/locales/`.
4. Add any country names its events and venues use that are missing from `COUNTRY_CODES`, and any
   F1 venue IDs to `VENUE_CIRCUIT_MAP`.
5. List the series in `README.md` and `AGENTS.md`.
