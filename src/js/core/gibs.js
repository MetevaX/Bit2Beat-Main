/**
 * Bit2Beat core · NASA satellite images for the Image tab search (GIBS, pure, no DOM).
 *
 * NASA's Global Imagery Browse Services (GIBS) draws more than a thousand satellite and model
 * layers as pictures of the whole Earth. These are the ones that tell a clear story in sound; each
 * was checked to draw the whole world (13 November 2026). Daily layers ask for a day a few days
 * back, when the satellites have covered the whole planet; monthly and fixed ones use their own
 * date. Every layer is read the same way as any picture (core/image.js).
 *
 * The true-colour Earth and the Black Marble night lights are presets in the Image menu, so they
 * are not in search.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).gibs = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
  // lag: days back from today (daily layers); time: a fixed date; neither: the layer's own newest
  const LAYERS = [
    { key: 'sst', layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', title: 'Sea surface temperature', lag: 3, by: 'GHRSST MUR (NASA JPL)', about: 'How warm the top of the ocean is, every day, from several satellites combined.', words: 'ocean sea water temperature warm hot cold el nino marine heat' },
    { key: 'landtemp', layer: 'MODIS_Terra_Land_Surface_Temp_Day', title: 'Land surface temperature (day)', lag: 3, by: 'MODIS Terra', about: 'How hot the ground itself is in the daytime; deserts and cities glow.', words: 'land ground heat hot temperature desert heatwave warm city' },
    { key: 'airtemp', layer: 'MERRA2_2m_Air_Temperature_Monthly', title: 'Air temperature (monthly)', by: 'MERRA-2 (NASA GMAO)', about: 'The average temperature of the air near the ground over a month.', words: 'air temperature climate warming cold hot weather month' },
    { key: 'rain', layer: 'IMERG_Precipitation_Rate', title: 'Rain and snowfall rate', lag: 4, by: 'GPM IMERG', about: 'Where it was raining or snowing, from the Global Precipitation Measurement mission.', words: 'rain rainfall precipitation storm storms monsoon flood snow weather hurricane' },
    { key: 'snowfall', layer: 'MERRA2_Snowfall_Monthly', title: 'Snowfall (monthly)', by: 'MERRA-2 (NASA GMAO)', about: 'How much snow fell over a month.', words: 'snow snowfall winter cold ice' },
    { key: 'clouds', layer: 'MODIS_Terra_Cloud_Fraction_Day', title: 'Cloud cover', lag: 3, by: 'MODIS Terra', about: 'How much of the sky is covered by cloud.', words: 'cloud clouds cloudy sky weather' },
    { key: 'vapour', layer: 'MODIS_Terra_Water_Vapor_5km_Day', title: 'Water vapour', lag: 3, by: 'MODIS Terra', about: 'Invisible water in the air, the fuel of clouds and storms.', words: 'water vapor vapour humidity moisture air steam' },
    { key: 'aerosols', layer: 'MODIS_Combined_Value_Added_AOD', title: 'Aerosols: smoke, dust and haze', lag: 3, by: 'MODIS Terra and Aqua', about: 'Tiny particles in the air that block sunlight: smoke from fires, desert dust, pollution haze.', words: 'aerosol aerosols smoke dust haze pollution particles air quality fire' },
    { key: 'dust', layer: 'MERRA2_Dust_Surface_Mass_Concentration_Monthly', title: 'Desert dust near the ground (monthly)', by: 'MERRA-2 (NASA GMAO)', about: 'Dust blown from the Sahara and other deserts.', words: 'dust sand desert sahara storm air' },
    { key: 'no2', layer: 'OMI_Nitrogen_Dioxide_Tropo_Column', title: 'Nitrogen dioxide (traffic and industry pollution)', lag: 6, by: 'OMI on Aura', about: 'A gas from cars, power plants and factories; cities stand out.', words: 'no2 nitrogen dioxide pollution traffic cars city cities industry factories air quality smog' },
    { key: 'so2', layer: 'OMI_SO2_Planetary_Boundary_Layer', title: 'Sulfur dioxide (volcanoes and coal burning)', lag: 3, by: 'OMI on Aura', about: 'A gas from volcanoes and coal burning.', words: 'so2 sulfur sulphur dioxide volcano volcanoes eruption pollution coal power' },
    { key: 'co', layer: 'AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Monthly_Day', title: 'Carbon monoxide (monthly)', by: 'AIRS on Aqua', about: 'A gas from fires and burning fuel, carried far by the wind.', words: 'carbon monoxide co fire fires smoke pollution burning' },
    { key: 'ozone', layer: 'OMPS_Ozone_Total_Column', title: 'Ozone layer', lag: 13, by: 'OMPS on Suomi NPP', about: 'The ozone that shields us from the Sun’s ultraviolet rays; the ozone hole appears over Antarctica in spring.', words: 'ozone hole layer uv ultraviolet stratosphere antarctica' },
    { key: 'fires', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor,VIIRS_NOAA20_Thermal_Anomalies_375m_All', title: 'Fires burning now', lag: 2, by: 'VIIRS on NOAA-20', about: 'Active fires and hot spots on a true-colour picture of the Earth.', words: 'fire fires wildfire wildfires forest fires bushfires burning burn hot spots smoke flames' },
    { key: 'vegetation', layer: 'MODIS_Terra_NDVI_8Day', title: 'Green vegetation (NDVI)', lag: 3, by: 'MODIS Terra', about: 'How green and leafy the land is: forests, crops and grassland.', words: 'vegetation plants green greenness forest forests trees crops agriculture farms grass ndvi leaves' },
    { key: 'landcover', layer: 'MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual', title: 'Land cover types', by: 'MODIS Terra and Aqua', about: 'Forests, grassland, crops, cities, ice and desert, each in its own colour.', words: 'land cover forest desert crops farms city urban ice grassland map' },
    { key: 'soil', layer: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', title: 'Soil moisture', lag: 4, by: 'SMAP', about: 'How wet the soil is where plant roots grow; dry land shows drought.', words: 'soil moisture wet dry drought water farms agriculture ground' },
    { key: 'water', layer: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI', title: 'Water stored on land (GRACE)', by: 'GRACE-FO', about: 'Changes in groundwater, lakes, snow and ice, weighed by satellites from their pull on gravity.', words: 'water groundwater drought aquifer gravity grace ice mass storage' },
    { key: 'salinity', layer: 'SMAP_L3_Sea_Surface_Salinity_CAP_Monthly', title: 'Ocean saltiness (monthly)', by: 'SMAP', about: 'How salty the sea surface is; big rivers make fresher patches.', words: 'salt salty salinity ocean sea water rivers' },
    { key: 'chlorophyll', layer: 'OCI_PACE_Chlorophyll_a', title: 'Ocean plankton (chlorophyll)', lag: 3, by: 'OCI on PACE', about: 'Tiny plants in the sea, seen by their green colour.', words: 'chlorophyll plankton phytoplankton algae ocean sea life fish marine green' },
    { key: 'seaice', layer: 'AMSRU2_Sea_Ice_Concentration_12km', title: 'Sea ice', time: '2025-03-01', by: 'AMSR2', about: 'Ice floating on the Arctic and Antarctic oceans (1 March 2025, near the Arctic maximum).', words: 'sea ice arctic antarctic polar frozen ice cold north pole' },
    { key: 'lightning', layer: 'LIS_Very_High_Resolution_Lightning_Full_Climatology_LIS_Mean_Flash_Rate', title: 'Where lightning strikes most', by: 'LIS on TRMM and the ISS', about: 'How often lightning flashes, averaged over many years.', words: 'lightning thunder thunderstorm storms flashes' },
    { key: 'population', layer: 'GPW_Population_Density_2020', title: 'Where people live (2020)', by: 'SEDAC (NASA)', about: 'How many people live in each square kilometre.', words: 'people population cities city towns density humans urban' },
    { key: 'elevation', layer: 'ASTER_GDEM_Color_Shaded_Relief', title: 'Mountains and elevation', by: 'ASTER GDEM', about: 'How high the land is, from the coast to the highest mountains.', words: 'elevation height mountains mountain topography terrain relief altitude himalaya andes' },
    { key: 'nightnow', layer: 'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance', title: 'The night side, recently', lag: 12, by: 'VIIRS on Suomi NPP', about: 'Lights, moonlit clouds, fires and fishing boats seen at night.', words: 'night lights city cities moon dark fishing boats' },
    { key: 'bluemarble', layer: 'BlueMarble_NextGeneration', title: 'Blue Marble: the Earth without clouds', by: 'NASA Earth Observatory', about: 'A cloud-free picture of the whole planet.', words: 'earth planet blue marble land ocean colour color photo' },
  ];

  const day = (now, lag) => new Date(now - lag * 864e5).toISOString().slice(0, 10);
  /** The date a layer is asked for ('' = the layer's own newest). */
  const timeOf = (l, now = Date.now()) => l.time || (l.lag != null ? day(now, l.lag) : '');

  /** WMS address for one layer of the whole world (EPSG:4326, west at the left). */
  function url(l, { width = 1440, now = Date.now(), bbox = [-90, -180, 90, 180] } = {}) {
    const [s, w, n, e] = bbox;
    const p = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: l.layer, CRS: 'EPSG:4326', BBOX: `${s},${w},${n},${e}`, WIDTH: String(width), HEIGHT: String(Math.round((width * (n - s)) / (e - w))), FORMAT: 'image/png', TRANSPARENT: 'TRUE' });
    const t = timeOf(l, now);
    if (t) p.set('TIME', t);
    return `${WMS}?${p}`;
  }

  /** Search entries (same shape as the gallery's). */
  function catalogue(now = Date.now()) {
    return LAYERS.map((l) => ({
      id: `gibs:${l.key}`,
      title: l.title,
      from: '',
      to: '',
      years: timeOf(l, now) || 'newest',
      text: `${l.about} · ${l.by} · ${l.words}`,
      about: l.about,
      kind: 'satellite image',
      gibs: l,
    }));
  }
  const find = (id) => LAYERS.find((l) => `gibs:${l.key}` === id || l.key === id) || null;

  return { WMS, LAYERS, timeOf, url, catalogue, find };
});
