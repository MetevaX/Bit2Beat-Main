/**
 * Bit2Beat core · geography helpers.
 * Equirectangular projection (matches assets/img/world-map.jpg, 2:1, 180°W–180°E, 90°N–90°S),
 * and a 1° land mask for coordinate sanity checks.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports ? { landmask: require('../data/landmask.js') } : root.Bit2Beat;
  const mod = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).geo = mod;
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';

  let bits = null;
  function maskBits() {
    if (bits) return bits;
    const b64 = deps.landmask.B64;
    if (typeof atob === 'function') {
      const s = atob(b64);
      bits = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bits[i] = s.charCodeAt(i);
    } else bits = Uint8Array.from(Buffer.from(b64, 'base64'));
    return bits;
  }

  /** True when the 1° cell containing (lat, lon) is land (or ice shelf) on the base map. */
  function isLand(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return false;
    const L = ((((lon + 180) % 360) + 360) % 360) - 180;
    const r = Math.min(179, Math.max(0, Math.floor(90 - lat)));
    const c = Math.min(359, Math.max(0, Math.floor(L + 180)));
    const i = r * 360 + c;
    return ((maskBits()[i >> 3] >> (7 - (i & 7))) & 1) === 1;
  }

  /** Land within about one degree (3 × 3 cells), so coastal events are not mistaken for sea. */
  function isLandNear(lat, lon) {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (isLand(lat + a, lon + b)) return true;
    return false;
  }
  /** Plausible place for a land event (flood, wildfire, volcano…): near land, not on the polar ice. */
  const plausibleLand = (lat, lon) => Math.abs(lat) <= 90 && lat > -56 && lat < 72 && isLandNear(lat, lon);

  /**
   * Some feeds publish polygon coordinates as [lat, lon] instead of GeoJSON's [lon, lat].
   * For events that can only happen on land, swap the pair when the given point is impossible
   * (latitude beyond ±90°) or implausible (open sea, polar ice) while the swapped point is on land.
   */
  function fixLatLon(lat, lon, onLand = true) {
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) return { lat: lon, lon: lat, swapped: true };
    if (!onLand) return { lat, lon, swapped: false };
    if (!plausibleLand(lat, lon) && Math.abs(lon) <= 90 && plausibleLand(lon, lat)) return { lat: lon, lon: lat, swapped: true };
    return { lat, lon, swapped: false };
  }

  /** Equirectangular projection to pixel coordinates in a w × h box. */
  const project = (lat, lon, w, h) => ({ x: ((lon + 180) / 360) * w, y: ((90 - lat) / 180) * h });

  /** Great-circle distance in km (haversine). */
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371.0088;
    const t = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * t) / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(((lon2 - lon1) * t) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /** Room position for a place on Earth: x = east/west, y = north/south, z supplied by caller. */
  const roomPosition = (lat, lon, z = 0.4) => ({ x: Math.max(-1, Math.min(1, lon / 180)), y: Math.max(-1, Math.min(1, lat / 90)), z });

  return { isLand, isLandNear, fixLatLon, project, distanceKm, roomPosition };
});
