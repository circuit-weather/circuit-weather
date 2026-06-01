// OpenF1 schedule fallback.
//
// Called directly from the browser (not via the Cloudflare Worker) because
// OpenF1 blocks requests from datacenter IP ranges — the Worker's edge IPs get
// 403s, but a user's browser on a residential connection does not. This mirrors
// how Open-Meteo weather data is fetched directly client-side.

// Maps OpenF1 circuit_short_name (lowercase) → Ergast circuitId so that track
// layers keep working when the schedule is served from the OpenF1 fallback.
export const OPENF1_CIRCUIT_MAP = {
    'sakhir': 'bahrain',
    'jeddah': 'jeddah',
    'melbourne': 'albert_park',
    'suzuka': 'suzuka',
    'shanghai': 'shanghai',
    'miami': 'miami',
    'imola': 'imola',
    'monaco': 'monaco',
    'barcelona': 'catalunya',
    'montreal': 'villeneuve',
    'montréal': 'villeneuve',
    'spielberg': 'red_bull_ring',
    'silverstone': 'silverstone',
    'budapest': 'hungaroring',
    'spa-francorchamps': 'spa',
    'zandvoort': 'zandvoort',
    'monza': 'monza',
    'baku': 'baku',
    'singapore': 'marina_bay',
    'austin': 'americas',
    'mexico city': 'rodriguez',
    'são paulo': 'interlagos',
    'las vegas': 'las_vegas',
    'lusail': 'losail',
    'abu dhabi': 'yas_marina',
};

const OPENF1_BASE = 'https://api.openf1.org/v1';
const OPENF1_TIMEOUT_MS = 8000;

/**
 * Convert an OpenF1 local datetime string + GMT offset to Ergast date/time fields.
 * Returns null if the datetime is absent (some future sessions are not yet scheduled).
 *
 * OpenF1's date_start is normally a full ISO 8601 string that already carries its
 * timezone offset, e.g. "2026-03-22T15:00:00+03:00". In that case we parse it
 * directly and ignore gmtOffset. As a fallback, if date_start has no embedded
 * timezone (e.g. "2026-03-22T15:00:00"), we apply gmtOffset ("03:00:00" /
 * "-05:00:00") to derive UTC.
 */
export function openF1ToErgastDateTime(dateStr, gmtOffset) {
    if (!dateStr) return null;

    // If date_start already carries a timezone (trailing Z, or ±HH:MM after the time),
    // let Date parse it directly — it resolves to the correct UTC instant on its own.
    const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(dateStr);
    let utcMs;
    if (hasTz) {
        utcMs = new Date(dateStr).getTime();
    } else {
        if (!gmtOffset) return null;
        const negative = gmtOffset.startsWith('-');
        const [h, m] = gmtOffset.replace(/^[-+]/, '').split(':').map(Number);
        const offsetMs = (negative ? -1 : 1) * (h * 60 + m) * 60000;
        utcMs = new Date(dateStr + 'Z').getTime() - offsetMs;
    }

    if (isNaN(utcMs)) return null;
    const utcDate = new Date(utcMs);
    return {
        date: utcDate.toISOString().slice(0, 10),
        time: utcDate.toISOString().slice(11, 19) + 'Z',
    };
}

/**
 * Transform OpenF1 meetings + sessions arrays into the Ergast
 * RaceTable.Races shape the rest of the app already consumes.
 */
export function transformOpenF1(meetings, sessions) {
    const sessionsByMeeting = {};
    for (const s of sessions) {
        (sessionsByMeeting[s.meeting_key] ??= []).push(s);
    }

    // Filter out pre-season testing (meetings with no Race session) and sort by date
    const raceMeetings = meetings
        .filter(m => (sessionsByMeeting[m.meeting_key] ?? []).some(s => s.session_type === 'Race'))
        .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    return raceMeetings.map((meeting, i) => {
        const msessions = sessionsByMeeting[meeting.meeting_key] ?? [];
        const circuitId = OPENF1_CIRCUIT_MAP[meeting.circuit_short_name?.toLowerCase()] ?? null;

        const race = {
            round: String(i + 1),
            raceName: meeting.meeting_name,
            Circuit: {
                circuitId,
                circuitName: meeting.circuit_short_name,
                // No coordinates: the map centre is derived from the track GeoJSON.
                Location: { lat: '', long: '', locality: meeting.location, country: meeting.country_name },
            },
        };

        for (const s of msessions) {
            const dt = openF1ToErgastDateTime(s.date_start, s.gmt_offset);
            if (!dt) continue;
            switch (s.session_type) {
                case 'Practice 1':        race.FirstPractice    = dt; break;
                case 'Practice 2':        race.SecondPractice   = dt; break;
                case 'Practice 3':        race.ThirdPractice    = dt; break;
                case 'Sprint Shootout':
                case 'Sprint Qualifying': race.SprintQualifying = dt; break;
                case 'Sprint':            race.Sprint           = dt; break;
                case 'Qualifying':        race.Qualifying       = dt; break;
                case 'Race':
                    race.date = dt.date;
                    race.time = dt.time;
                    break;
            }
        }

        return race;
    });
}

/**
 * Fetch the current season schedule directly from OpenF1 and return it as an
 * array of Ergast-shaped race objects. Throws on any network/HTTP failure.
 */
export async function fetchOpenF1Schedule() {
    const year = new Date().getFullYear();
    const signal = AbortSignal.timeout(OPENF1_TIMEOUT_MS);
    const init = { headers: { Accept: 'application/json' }, signal };

    const [meetingsRes, sessionsRes] = await Promise.all([
        fetch(`${OPENF1_BASE}/meetings?year=${year}`, init),
        fetch(`${OPENF1_BASE}/sessions?year=${year}`, init),
    ]);

    if (!meetingsRes.ok || !sessionsRes.ok) {
        throw new Error(`OpenF1 error: meetings=${meetingsRes.status} sessions=${sessionsRes.status}`);
    }

    const [meetings, sessions] = await Promise.all([meetingsRes.json(), sessionsRes.json()]);
    return transformOpenF1(meetings, sessions);
}
