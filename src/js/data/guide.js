/**
 * Bit2Beat data · what Bitty says when guiding visitors.
 * Tours are lists of steps. A step spotlights one control (target = CSS selector) or, as a
 * “hero” card, sits in the middle of the screen with its own buttons.
 *
 * Step fields: id, mood (happy | excited | curious | joy), title, text, target, ensure (tab to
 * open first), interactive + action (the step waits until you try the control), done (what Bitty
 * says when you did), hero, badge, menu (buttons as a list), buttons [{ label, go, kind }].
 * go: 'next' | 'close' | 'hub' | 'story' | 'help' | 'tour:<id>'.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).guide = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const section = (titleId) => `section[aria-labelledby="${titleId}"]`;

  const TOURS = {
    hello: {
      title: 'Hello',
      steps: [
        {
          id: 'hello',
          mood: 'excited',
          hero: true,
          title: 'Woof! I’m Bitty.',
          text: 'I’m a space pup with very good ears, and I’m your guide here. Satellites send me Earth’s numbers, but numbers are silent, so Bit2Beat turns them into music. Shall I show you around? It takes about a minute.',
          buttons: [
            { label: 'Show me around', go: 'tour:studio', kind: 'primary' },
            { label: 'Tell me the story', go: 'story' },
            { label: 'Not now', go: 'close', kind: 'link' },
          ],
          note: 'You can call me back any time with Guide (top right) or the G key.',
        },
      ],
    },

    hub: {
      title: 'Guide',
      steps: [
        {
          id: 'hub',
          mood: 'happy',
          hero: true,
          menu: true,
          title: 'How can I help?',
          text: 'Pick what you want me to show you. I point at the real buttons, and you can try each one.',
          buttons: [
            { label: 'Tour the whole studio · about a minute', go: 'tour:studio', kind: 'primary' },
            { label: 'How the Data tab works', go: 'tour:data' },
            { label: 'How Earth events work', go: 'tour:earth' },
            { label: 'How the Image tab works', go: 'tour:image' },
            { label: 'How the Video tab works', go: 'tour:video' },
            { label: 'Listen to my story', go: 'story' },
            { label: 'Keyboard shortcuts', go: 'help' },
          ],
        },
      ],
    },

    studio: {
      title: 'The studio',
      steps: [
        { id: 'tabs', mood: 'curious', target: '.modes', ensure: 'data', title: 'Four ways to listen', text: 'Image turns NASA maps and satellite views into sound. Video follows NASA animations and time-lapses. Earth events plays natural events and earthquakes across the map. Data plays climate series and your own CSV files.' },
        { id: 'search', mood: 'excited', target: '#eicSearch', ensure: 'data', title: 'Ask for any Earth data', text: 'Type what you want to hear in your own words, like “methane from wetlands in the Amazon”. I search NASA’s Earth Information Center (Gemini helps me pick) and play it in the tab you are in: a map in Image, a time-lapse in Video, a melody in Data.' },
        { id: 'source', mood: 'happy', target: '.source-pick', ensure: 'data', title: 'Pick a source', text: 'Each tab has its own menu. Everything in it is real data with a source line, and it works offline too. Upload brings your own file: data, a picture or a video, and opens the right tab by itself.' },
        { id: 'chart', mood: 'curious', target: '#sourceCard', ensure: 'data', title: 'This is what you hear', text: 'Left to right is time. Higher on the chart means a higher note. Hover to read a value; click anywhere to hear that one step.' },
        {
          id: 'play',
          mood: 'excited',
          target: '#playBtn',
          ensure: 'data',
          interactive: true,
          title: 'Press play, co-pilot',
          text: 'Press the big Play button (or the Space bar). Headphones make it even better.',
          action: { type: 'play', show: 'Play it for me' },
          done: 'Hear that? A whole century of temperature in under a minute.',
        },
        { id: 'now', mood: 'happy', target: '.card.now', title: 'Now playing', text: 'The navy card says which step is playing, its note, and the real value behind it. The bars dance with the sound.' },
        { id: 'melody', mood: 'curious', target: '.duo', title: 'See it, read it', text: 'Melody shows every note, with the amber line as the playhead. “What the data says” explains the trend in plain words; Read aloud (or D) reads it to you, and you can pause or stop me at the top of the screen.' },
        { id: 'sound', mood: 'happy', target: section('soundTitle'), title: 'Make it yours', text: 'Change the instrument, scale and tempo, or press Smart Tuning and I’ll pick them from the shape of the data.' },
        { id: 'channels', mood: 'curious', target: section('mixTitle'), title: 'One voice per series', text: 'Every series is its own voice. M mutes it, S plays it alone and ⇅ flips its pitch.' },
        {
          id: 'earth',
          mood: 'excited',
          target: '#tab-earth',
          interactive: true,
          title: 'Earth is busy',
          text: 'Now open Earth events. Natural events and earthquakes play as one sweep from west to east: further north sounds higher, bigger sounds louder.',
          action: { type: 'mode', value: 'earth', show: 'Take me there' },
          done: 'See the map? Each dot is a real event: wildfires, storms, floods, ice and earthquakes (electric piano), played from west to east.',
        },
        { id: 'export', mood: 'happy', target: '#exportBtn', title: 'Take it home', text: 'Export makes WAV files (stereo, binaural or surround), the notes as CSV and the score. The address bar remembers everything, so a refresh or a shared link opens this exact view.' },
        { id: 'guide', mood: 'happy', target: '#guideBtn', title: 'I’m always here', text: 'Press Guide (or G) whenever you want me to explain a tab. My card under the score also gives a tip when you open a tab for the first time.' },
        {
          id: 'end',
          mood: 'joy',
          hero: true,
          badge: true,
          title: 'You’re ready!',
          text: 'That’s the studio. Want to hear what Earth has been telling me? My story plays eight real data sets, one chapter at a time, and you earn the Earth Listener badge at the end.',
          buttons: [
            { label: 'Listen to my story', go: 'story', kind: 'primary' },
            { label: 'Show me one tab', go: 'hub' },
            { label: 'Keep exploring', go: 'close', kind: 'link' },
          ],
        },
      ],
    },

    data: {
      title: 'The Data tab',
      steps: [
        { id: 'd-source', mood: 'happy', target: '.source-pick', ensure: 'data', title: 'Pick a data set', text: 'NASA global temperature since 1880, the Arctic (Svalbard) by year or by day, or a practice shape. Practice shapes teach your ears what a rise, a peak or a cycle sounds like.' },
        { id: 'd-length', mood: 'curious', target: '#opts-data > .field', ensure: 'data', title: 'Points to play', text: 'Long series can be squeezed into 240, 120, 60 or 30 steps. Each step is the average of its group, so a whole year of days fits into half a minute.' },
        { id: 'd-power', mood: 'excited', target: '#powerForm', ensure: 'data', title: 'Any place, any year', text: 'NASA POWER has daily weather for every place on Earth. Pick one of 18 places and a year since 1981, then Load. You hear temperature and sunlight day by day (needs internet).' },
        { id: 'd-csv', mood: 'happy', target: '#uploadBtn', ensure: 'data', title: 'Your own numbers', text: 'Upload (in the top bar) opens any file and picks the right tab: CSV, TSV, TXT, JSON, GeoJSON, Excel or OpenDocument sheets play here. Up to six number columns, each one a voice; a year or date column becomes the labels. Your file never leaves your computer.' },
        { id: 'd-aids', mood: 'curious', target: '#insights', ensure: 'data', title: 'What the data says', text: 'I sum up the trend, the highest and lowest values and any sudden jumps. Under Listening aids you can add a reference tone at the baseline and a tick on sudden jumps.' },
        { id: 'd-table', mood: 'happy', target: '#tableBtn', title: 'Every number, as text', text: 'Readings (or T) lists every value with its note, frequency and time. Pick a row to hear that step.' },
      ],
    },

    earth: {
      title: 'Earth events',
      steps: [
        { id: 'e-source', mood: 'curious', target: '.source-pick', ensure: 'earth', title: 'Natural events and earthquakes', text: 'NASA EONET natural events (wildfires, storms, floods, ice) and USGS earthquakes play together; earthquakes are one more channel (electric piano). The offline sample always works, even without internet.' },
        { id: 'e-map', mood: 'excited', target: '#dropZone', ensure: 'earth', title: 'Read the map like a page', text: 'Each dot is one event. When you press Play, the amber line sweeps from west to east: further north is a higher note, bigger is louder and a bigger dot. Hover a dot to read it; click it to hear it.' },
        { id: 'e-options', mood: 'happy', target: '#opts-earth', ensure: 'earth', title: 'Rhythm of the sweep', text: 'Choose the period. Even steps plays one event per note; Map distance keeps the real gaps along the sweep, so busy places sound busy and empty oceans go quiet.' },
        { id: 'e-live', mood: 'curious', target: '#fetchBtn', ensure: 'earth', title: 'Live, saved or bundled', text: 'Get latest asks USGS or NASA for the newest events. The label on the card always says whether you hear Live data, a Saved copy or the Bundled snapshot.' },
        { id: 'e-mix', mood: 'happy', target: section('mixTitle'), ensure: 'earth', title: 'Follow one kind', text: 'For natural events, each kind has its own channel and instrument. Press S on one to hear only wildfires, or only storms.' },
      ],
    },

    image: {
      title: 'The Image tab',
      steps: [
        { id: 'i-search', mood: 'excited', target: '#eicSearch', ensure: 'image', title: 'Search the Earth Information Center', text: 'Type a subject and a place in your own words. Choose a result and I draw its newest map, coloured over the real spread of the data, and play it.' },
        { id: 'i-source', mood: 'curious', target: '.source-pick', ensure: 'image', title: 'Or pick a picture', text: 'NASA pictures that work offline, live NASA satellite views (choose a date), an offline world map, or Upload (in the top bar) for your own picture.' },
        { id: 'i-look', mood: 'happy', target: '#analysisGroup', ensure: 'image', title: 'What to hear', text: 'Light plays brightness, detail and where the bright areas are. Colour plays red, green and blue. Colour key (NASA pictures) reads the real value through the picture’s own colour bar.' },
        { id: 'i-scan', mood: 'excited', target: '#scanGroup', ensure: 'image', title: 'How to scan', text: 'Left to right, top to bottom, Radar (a beam turns around the centre and reaches every corner), or Follow pointer: move your mouse or finger over the picture and hear the data under it. Click the picture to jump there.' },
        { id: 'i-steps', mood: 'curious', target: '#opts-image .field-range', ensure: 'image', title: 'Steps', text: 'How many bands the picture is cut into, from 16 to 160. More steps means more detail and a longer melody. Empty background around a globe stays silent.' },
      ],
    },

    video: {
      title: 'The Video tab',
      steps: [
        { id: 'v-search', mood: 'curious', target: '#eicSearch', ensure: 'video', title: 'Make a time-lapse', text: 'Search for any Earth Information Center data set and choose a result: I fetch its latest maps and play them as a time-lapse, one map and one note at a time.' },
        { id: 'v-video', mood: 'excited', target: '#videoBox', ensure: 'video', title: 'The video follows the music', text: 'The NASA video plays muted, in step with the notes. Click it to play or pause; ← and → step through it and show that exact moment.' },
        { id: 'v-timeline', mood: 'curious', target: '#dropZone', ensure: 'video', title: 'Two notes per second', text: 'Below the video is the music’s timeline. Each note stands for half a second of video, averaged so flickering pictures do not fake a rhythm.' },
        { id: 'v-mix', mood: 'happy', target: section('mixTitle'), ensure: 'video', title: 'Read through the colour bar', text: 'NASA videos are read through their colour bar: you hear the value shown (forest height or CO₂) and how much of the picture shows data. Motion starts muted; unmute it to hear the change.' },
        { id: 'v-open', mood: 'happy', target: '#uploadBtn', ensure: 'video', title: 'Your own video', text: 'Upload (in the top bar) plays your own video: MP4, WebM, MOV, MKV and more (up to 200 MB). You hear brightness, colour and motion, with empty background left out. It is analysed on your computer.' },
      ],
    },
  };

  /** A short tip on Bitty’s card the first time each tab is opened. */
  const TIPS = {
    data: 'New to the Data tab? I can show you how to pick a data set, squeeze long series and open your own CSV.',
    earth: 'Earth events play as one sweep across the map. Want me to show you how to read it?',
    image: 'Search above for any NASA Earth data, or pick a picture. Shall I show you how to listen to one?',
    video: 'The video follows the music. Want a 30-second tour of this tab?',
  };

  return { TOURS, TIPS };
});
