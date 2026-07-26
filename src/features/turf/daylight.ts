// Pure logic for the Daylight-Aware Shift Clock: real sunset time computed
// from a territory's own lat/lng, using the standard closed-form
// sunrise/sunset equation (solar declination + hour angle from
// day-of-year and latitude — see
// https://en.wikipedia.org/wiki/Sunrise_equation). Zero dependencies, zero
// API calls — no other campaign platform computes this from first
// principles. Accurate to within a few minutes (atmospheric refraction and
// the simplified equation of center are the main error sources), which is
// plenty for "how much daylight is left on this shift." No Supabase import
// (pattern: route.ts, doorstep.ts) — see daylight.test.ts.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function toJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function fromJulianDate(J: number): Date {
  return new Date((J - 2440587.5) * 86400000);
}

export type DaylightInfo = {
  sunriseUtc: Date;
  sunsetUtc: Date;
  minutesOfDaylightLeft: number; // 0 once the sun's down, clamped
  daylightMinutesTotal: number;
};

// lat/lng in degrees (lng positive east, matching the app's GeoJSON
// convention everywhere else in turf/). `now` is the moment to evaluate —
// both which day's sunset to compute AND how much daylight is left as of
// that instant.
export function computeDaylight(lat: number, lng: number, now: Date = new Date()): DaylightInfo {
  const J = toJulianDate(now);
  const n = Math.floor(J - 2451545.0 + 0.0008);

  const Jstar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const Mrad = M * DEG;
  const C = 1.9148 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad);
  const lambda = (M + 102.9372 + C + 180) % 360;
  const lambdaRad = lambda * DEG;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambdaRad);

  const sinDelta = Math.sin(lambdaRad) * Math.sin(23.4397 * DEG);
  const delta = Math.asin(sinDelta);
  const latRad = lat * DEG;
  const cosOmega =
    (Math.sin(-0.833 * DEG) - Math.sin(latRad) * Math.sin(delta)) / (Math.cos(latRad) * Math.cos(delta));
  // Clamped for polar day/night, where the sun never sets or never rises —
  // acos would otherwise be NaN.
  const omega = Math.acos(Math.max(-1, Math.min(1, cosOmega))) * RAD;

  const Jset = Jtransit + omega / 360;
  const Jrise = Jtransit - omega / 360;
  const sunsetUtc = fromJulianDate(Jset);
  const sunriseUtc = fromJulianDate(Jrise);

  const daylightMinutesTotal = Math.max(0, (sunsetUtc.getTime() - sunriseUtc.getTime()) / 60000);
  const minutesOfDaylightLeft = Math.max(0, (sunsetUtc.getTime() - now.getTime()) / 60000);

  return { sunriseUtc, sunsetUtc, minutesOfDaylightLeft, daylightMinutesTotal };
}
