// Production-web equivalent of the Vite dev proxy (vite.config.js) and the
// Tauri native-HTTP branch (src/features/turf/geocode.js): the Census
// geocoder sends no CORS headers, so a hosted web build needs a server-side
// hop too. vercel.json rewrites /census-geocode/* to this function, so the
// client's fetch path is identical across dev, Tauri, and hosted web.
export const config = { runtime: 'edge' };

const CENSUS_ORIGIN = 'https://geocoding.geo.census.gov';

export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/census-geocode/, '');
  const target = `${CENSUS_ORIGIN}${path}${url.search}`;

  const upstream = await fetch(target);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' }
  });
}
