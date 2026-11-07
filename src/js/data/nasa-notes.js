/* Bit2Beat · short notes from the NASA Image and Video Library (images.nasa.gov), saved 6–7 Nov 2026
   so BitPet has something to say offline. Each `topic` matches what is playing. */
(function (root) {
  const NOTES = [
    { topic: 'climate', id: 'PIA24139', title: 'AIRS Temperature Anomalies', date: '2022-01-04', text: "This animation shows a nearly 20-year record of temperature anomalies for two layers in Earth's atmosphere: the lower troposphere, where most of the planet's weather occurs; and the upper stratosphere, which contains the ozone layer." },
    { topic: 'climate', id: 'PIA26185', title: 'PREFIRE CubeSat in Earth Orbit', date: '2024-05-15', text: "NASA's Polar Radiant Energy in the Far-InfraRed Experiment (PREFIRE) mission will measure the amount of heat Earth emits into space from two of the coldest, most remote regions on the planet." },
    { topic: 'climate', id: 'PIA20039', title: 'NASA Carbon Sleuth Begins Year Two', date: '2015-10-29', text: "Global average carbon dioxide concentrations as seen by NASA’s Orbiting Carbon Observatory-2 mission, June 1-15, 2015. OCO-2 measures carbon dioxide from the top of Earth's atmosphere to its surface." },
    { topic: 'quakes', id: 'PIA20035', title: 'Earthquake in Hindu Kush Region, Afghanistan', date: '2015-10-27', text: "On Oct. 26, 2015, NASA Terra spacecraft acquired this image of northeastern Afghanistan where a magnitude 7.5 earthquake struck the Hindu Kush region. The earthquake's epicenter was at a depth of 130 miles (210 kilometers), on a probable shallowly dipping thrust fault." },
    { topic: 'quakes', id: 'PIA25281', title: "Seismogram and Sonification of InSight's Big Martian Quake", date: '2022-05-17', text: "This video includes a seismogram and sonification of the signals recorded by NASA's InSight Mars lander, which detected an estimated magnitude 5 quake on May 4, 2022, the 1,222nd Martian day, or sol, of the mission." },
    { topic: 'quakes', id: 'PIA25582', title: "NASA's InSight Records the Sound of a Martian Impact", date: '2022-10-27', text: "InSight's seismometer recorded seismic signals that are not in the range of human hearing. In order to make the signals audible, the data was sped up 100 times." },
    { topic: 'events', id: 'PIA03421', title: 'A Panoramic View of the Emigrant Gap Fire, California', date: '2001-09-05', text: 'These images from NASA Terra satellite are of the Central Valley and the Sierra Nevada Mountains showing several smoke plumes from wildfires burning throughout Northern California on August 13, 2001.' },
    { topic: 'events', id: 'PIA10088', title: 'Swirls of Smoke and Dust Blow Out to Sea', date: '2007-10-23', text: 'Smoke from multiple wildfires burning in Southern California in October, 2007, can be seen in this false-color image from the Atmospheric Infrared Sounder AIRS on NASA Aqua satellite.' },
    { topic: 'events', id: 'iss072e057797_alt', title: 'Hurricane Milton in the Gulf of Mexico', date: '2024-10-09', text: 'Hurricane Milton is pictured as a category 4 storm in the Gulf of Mexico nearing the coast of Florida in this photograph from the International Space Station as it orbited 256 miles above.' },
    { topic: 'events', id: 'PIA23142', title: 'Satellites Image Mozambique Flooding after Cyclone Idai', date: '2019-04-01', text: "The Advanced Rapid Imaging and Analysis (ARIA) team at NASA's Jet Propulsion Laboratory created these flood proxy maps depicting areas of Mozambique that are likely flooded as a result of Cyclone Idai." },
    { topic: 'events', id: 'GSFC_20171208_Archive_e000021', title: 'Massive Iceberg Breaks Off from Antarctica', date: '2017-07-12', text: 'Sometime between July 10 and July 12, an iceberg about the size of Delaware split off from Antarctica’s Larsen C ice shelf. Now that nearly 5,800 square kilometers (2,200 square miles) of ice has broken away, the Larsen C shelf area has shrunk by approximately 10 percent.' },
    { topic: 'events', id: 'PIA03431', title: 'Birth of a Large Iceberg in Pine Island Bay, Antarctica', date: '2001-11-14', text: 'A large tabular iceberg (42 kilometers x 17 kilometers) broke off Pine Island Glacier, West Antarctica (75ºS latitude, 102ºW longitude) sometime between November 4 and 12, 2001.' },
    { topic: 'arctic', id: 'PIA10626', title: 'Longyearbyen, Svalbard, Norway', date: '2008-03-10', text: 'Longyearbyen is the administrative center of Svalbard and is located on Spitsbergen, the largest island of the Svalbard archipelago. NASA Terra satellite captured this image on July 12, 2003.' },
    { topic: 'arctic', id: 'GSFC_20171208_Archive_e000613', title: 'Approaching the 2015 Arctic Sea Ice Minimum', date: '2017-12-08', text: 'As the sun sets over the Arctic, the end of this year’s melt season is quickly approaching and the sea ice cover has already shrunk to the fourth lowest in the satellite record.' },
    { topic: 'arctic', id: 'GSFC_20171208_Archive_e000190', title: 'Arctic Sea Ice Is Losing Its Bulwark Against Warming Summers', date: '2017-12-08', text: 'Arctic sea ice, the vast sheath of frozen seawater floating on the Arctic Ocean and its neighboring seas, has been hit with a double whammy over the past decades: as its extent shrunk, the oldest and thickest ice has either thinned or melted away.' },
    { topic: 'image', id: 'iss072e159172', title: 'The aurora borealis blankets the Earth', date: '2024-10-30', text: "The aurora borealis blankets the Earth in this photograph from the International Space Station as it soared 257 miles above Canada's province of Manitoba." },
    { topic: 'image', id: 'iss066e146457', title: 'Aurora australis over the Indian Ocean', date: '2022-02-18', text: 'The aurora australis streams above the Indian Ocean in this picture from the International Space Station as it orbited 270 miles above the Earth.' },
    { topic: 'image', id: 'PIA25069', title: "Earth's Ocean and Jupiter's Atmosphere", date: '2022-01-18', text: "This morphing animation compares the eddies in Earth's oceans to the turbulent clouds in Jupiter's atmosphere." },
    { topic: 'image', id: 'iss074e0089803', title: "Earth's thin blue atmosphere above the Pacific Ocean", date: '2026-01-16', text: "Earth's thin blue atmosphere traces the planet's horizon as the sun's glint beams off a partly cloudy Pacific Ocean west of Chile on the South American continent." },
    { topic: 'image', id: 'PIA21376', title: 'Crescent Jupiter with the Great Red Spot', date: '2017-01-13', text: "This image of a crescent Jupiter and the iconic Great Red Spot was created by a citizen scientist (Roman Tkachenko) using data from Juno's JunoCam instrument." },
  ];
  /** Search words used to fetch fresh notes for what is playing. */
  const QUERIES = {
    climate: ['global temperature', 'climate satellite', 'sea surface temperature'],
    quakes: ['earthquake', 'tsunami', 'volcano'],
    events: ['wildfire', 'hurricane', 'flood satellite', 'iceberg'],
    arctic: ['arctic sea ice', 'greenland ice sheet', 'polar night'],
    image: ['earth from space station', 'aurora', 'city lights at night'],
  };
  const mod = { NOTES, QUERIES };
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).nasaNotes = mod;
})(typeof self !== 'undefined' ? self : this);
