const SONGS_API = 'https://api.github.com/repos/asolinas/canzoniere/contents/songs';
const layoutEl = document.getElementById('layout');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const songListEl = document.getElementById('song-list');
const searchInput = document.getElementById('search-input');
const reloadBtn = document.getElementById('reload-songs');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const songViewer = document.getElementById('song-viewer');
const songTitleEl = document.getElementById('song-title');
const songSubtitleEl = document.getElementById('song-subtitle');
const songBodyEl = document.getElementById('song-body');
const songScrollEl = document.getElementById('song-scroll');
const scrollSlider = document.getElementById('scroll-slider');
const scrollPlayBtn = document.getElementById('scroll-play');
const scrollPauseBtn = document.getElementById('scroll-pause');

const transposeValueEl = document.getElementById('transpose-value');
const zoomValueEl = document.getElementById('zoom-value');
const transposeUpBtn = document.getElementById('transpose-up');
const transposeDownBtn = document.getElementById('transpose-down');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');

let songs = [];
let filteredSongs = [];
let currentSong = null;
let transposeSteps = 0;
let zoomPercent = 100;
let autoScrollActive = false;
let lastAutoScrollTick = null;
const DEFAULT_SCROLL_SPEED = 30;
const MIN_SCROLL_SPEED = 3;
const MAX_SCROLL_SPEED = 28;

scrollSlider.value = DEFAULT_SCROLL_SPEED;
scrollSlider.disabled = true;
scrollPlayBtn.disabled = true;
scrollPauseBtn.disabled = true;

function toggleSidebar() {
  const collapsed = layoutEl.classList.toggle('sidebar-collapsed');
  toggleSidebarBtn.textContent = collapsed ? '>' : '<';
  toggleSidebarBtn.setAttribute(
    'aria-label',
    collapsed ? 'Mostra barra laterale' : 'Nascondi barra laterale'
  );
}

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = false;
  songViewer.hidden = true;
  stopAutoScroll();
  scrollSlider.value = DEFAULT_SCROLL_SPEED;
  scrollSlider.disabled = true;
  updateAutoScrollButtons();
}

function showSong() {
  statusEl.hidden = true;
  songViewer.hidden = false;
}

async function fetchSongs() {
  songListEl.innerHTML = '<div class="song-item">Caricamento elenco...</div>';
  try {
    const response = await fetch(SONGS_API);
    if (!response.ok) throw new Error('Errore nella richiesta');
    const data = await response.json();
    songs = data
      .filter((item) => item.type === 'file' && item.name.toLowerCase().endsWith('.cho'))
      .map((item) => ({
        name: item.name,
        path: item.path,
        downloadUrl: item.download_url,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    filteredSongs = songs;
    renderSongList();
  } catch (err) {
    showStatus('Impossibile recuperare i brani dal repository.');
    songListEl.innerHTML = `<div class="song-item">${err.message}</div>`;
  }
}

function renderSongList() {
  if (!filteredSongs.length) {
    songListEl.innerHTML = '<div class="song-item">Nessun brano trovato</div>';
    return;
  }

  songListEl.innerHTML = '';
  filteredSongs.forEach((song) => {
    const item = document.createElement('button');
    item.className = 'song-item';
    item.role = 'listitem';
    item.innerHTML = `<span class="song-item-title">${cleanTitle(song.name)}</span><small>${song.name}</small>`;
    item.addEventListener('click', () => loadSongFromUrl(song.downloadUrl, song.name));
    songListEl.appendChild(item);
  });
}

function cleanTitle(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
}

function filterSongs(term) {
  const query = term.trim().toLowerCase();
  filteredSongs = songs.filter((song) =>
    song.name.toLowerCase().includes(query) || cleanTitle(song.name).toLowerCase().includes(query)
  );
  renderSongList();
}

async function loadSongFromUrl(url, name) {
  showStatus('Caricamento del brano...');
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Errore nel download');
    const content = await response.text();
    handleSongContent(content, name);
  } catch (err) {
    showStatus(`Impossibile caricare il brano: ${err.message}`);
  }
}

function handleSongContent(content, filename = 'Brano personalizzato') {
  transposeSteps = 0;
  zoomPercent = 100;
  stopAutoScroll();
  updateControlDisplays();
  currentSong = parseChordPro(content, filename);
  renderSong(currentSong);
  showSong();
  songScrollEl.scrollTop = 0;
  scrollSlider.disabled = false;
  updateAutoScrollButtons();
}

function parseChordPro(content, fallbackTitle) {
  const lines = content.split(/\r?\n/);
  const parsed = { title: cleanTitle(fallbackTitle), subtitle: '', lines: [] };
  let inChorus = false;

  lines.forEach((line) => {
    const directiveMatch = line.match(/^\{\s*([^:}]+)\s*:?\s*(.*?)\s*}$/i);
    if (directiveMatch) {
      const keyword = directiveMatch[1].toLowerCase();
      const value = directiveMatch[2];
      switch (keyword) {
        case 'title':
        case 't':
          parsed.title = value || parsed.title;
          break;
        case 'subtitle':
        case 'st':
          parsed.subtitle = value;
          parsed.lines.push({ type: 'subtitle', text: value });
          break;
        case 'comment':
        case 'c':
          parsed.lines.push({ type: 'comment', text: value });
          break;
        case 'start_of_chorus':
        case 'soc':
          parsed.lines.push({ type: 'section_start', name: 'chorus' });
          inChorus = true;
          break;
        case 'end_of_chorus':
        case 'eoc':
          parsed.lines.push({ type: 'section_end', name: 'chorus' });
          inChorus = false;
          break;
        default:
          break;
      }
      return;
    }

    if (!line.trim()) {
      parsed.lines.push({ type: 'spacer' });
      return;
    }

    parsed.lines.push({
      type: 'lyric',
      tokens: tokenizeLine(line),
      chorus: inChorus,
    });
  });

  return parsed;
}

function tokenizeLine(line) {
  const tokens = [];
  let buffer = '';
  let currentChord = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '[') {
      if (buffer || currentChord !== null) {
        tokens.push({ chord: currentChord, lyric: buffer });
      }
      buffer = '';
      currentChord = '';
      continue;
    }

    if (char === ']' && currentChord !== null) {
      tokens.push({ chord: currentChord, lyric: '' });
      currentChord = null;
      buffer = '';
      continue;
    }

    if (currentChord !== null) {
      currentChord += char;
    } else {
      buffer += char;
    }
  }

  if (buffer || currentChord !== null) {
    tokens.push({ chord: currentChord, lyric: buffer });
  }
  if (tokens.length === 0) tokens.push({ chord: null, lyric: line });
  return tokens;
}

function renderSong(song) {
  songTitleEl.textContent = song.title || 'Senza titolo';
  if (song.subtitle) {
    songSubtitleEl.textContent = song.subtitle;
    songSubtitleEl.hidden = false;
  } else {
    songSubtitleEl.hidden = true;
  }

  songBodyEl.innerHTML = '';
  const stack = [songBodyEl];

  song.lines.forEach((line) => {
    switch (line.type) {
      case 'subtitle': {
        const el = document.createElement('div');
        el.className = 'comment';
        el.textContent = line.text;
        stack[stack.length - 1].appendChild(el);
        break;
      }
      case 'comment': {
        const el = document.createElement('div');
        el.className = 'comment';
        el.textContent = line.text;
        stack[stack.length - 1].appendChild(el);
        break;
      }
      case 'spacer': {
        const el = document.createElement('div');
        el.className = 'spacer';
        stack[stack.length - 1].appendChild(el);
        break;
      }
      case 'section_start': {
        if (line.name === 'chorus') {
          const chorus = document.createElement('div');
          chorus.className = 'chorus';
          stack[stack.length - 1].appendChild(chorus);
          stack.push(chorus);
        }
        break;
      }
      case 'section_end': {
        if (line.name === 'chorus' && stack.length > 1) {
          stack.pop();
        }
        break;
      }
      case 'lyric': {
        const el = document.createElement('div');
        el.className = 'song-line';
        line.tokens.forEach((token) => {
          const wrapper = document.createElement('span');
          wrapper.className = 'chorded-token';

          if (token.chord) {
            const chordEl = document.createElement('span');
            chordEl.className = 'chord';
            chordEl.textContent = transposeChord(token.chord, transposeSteps);
            wrapper.appendChild(chordEl);
          } else {
            const chordEl = document.createElement('span');
            chordEl.className = 'chord';
            chordEl.innerHTML = '&nbsp;';
            wrapper.appendChild(chordEl);
          }

          const lyricEl = document.createElement('span');
          lyricEl.className = 'lyric';
          lyricEl.textContent = token.lyric;
          wrapper.appendChild(lyricEl);
          el.appendChild(wrapper);
        });
        stack[stack.length - 1].appendChild(el);
        break;
      }
      default:
        break;
    }
  });

  updateZoom();
}

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function normalizePitch(pitch) {
  const flats = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  return flats[pitch] || pitch;
}

function transposeChord(chord, steps) {
  const slashParts = chord.split('/');
  const transposedParts = slashParts.map((part) => transposeSingle(part, steps));
  return transposedParts.join('/');
}

function transposeSingle(chord, steps) {
  const match = chord.match(/^([A-G])(b|#)?(.*)$/);
  if (!match) return chord;

  const [, note, accidental = '', rest] = match;
  const normalized = normalizePitch(`${note}${accidental}`);
  const index = CHROMATIC.indexOf(normalized);
  if (index === -1) return chord;

  const newIndex = (index + steps + CHROMATIC.length) % CHROMATIC.length;
  const newNote = CHROMATIC[newIndex];
  return `${newNote}${rest}`;
}

function updateControlDisplays() {
  transposeValueEl.textContent = transposeSteps;
  zoomValueEl.textContent = `${zoomPercent}%`;
}

function updateZoom() {
  const lyricSize = 18 * (zoomPercent / 100);
  const chordSize = 15 * (zoomPercent / 100);
  document.documentElement.style.setProperty('--lyric-size', `${lyricSize}px`);
  document.documentElement.style.setProperty('--chord-size', `${chordSize}px`);
}

function startAutoScroll() {
  if (!currentSong || autoScrollActive) return;
  autoScrollActive = true;
  lastAutoScrollTick = null;
  updateAutoScrollButtons();
  requestAnimationFrame(stepAutoScroll);
}

function stopAutoScroll() {
  autoScrollActive = false;
  lastAutoScrollTick = null;
  updateAutoScrollButtons();
}

function stepAutoScroll(timestamp) {
  if (!autoScrollActive) return;
  if (lastAutoScrollTick === null) {
    lastAutoScrollTick = timestamp;
    requestAnimationFrame(stepAutoScroll);
    return;
  }

  const deltaSeconds = (timestamp - lastAutoScrollTick) / 1000;
  lastAutoScrollTick = timestamp;
  const speedPercent = Number(scrollSlider.value) || 0;
  const normalized = Math.min(Math.max(speedPercent / 100, 0), 1);
  const pixelsPerSecond =
    speedPercent === 0
      ? 0
      : MIN_SCROLL_SPEED + normalized * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED);
  songScrollEl.scrollTop += pixelsPerSecond * deltaSeconds;

  const atBottom =
    Math.ceil(songScrollEl.scrollTop) >= songScrollEl.scrollHeight - songScrollEl.clientHeight;

  if (atBottom) {
    songScrollEl.scrollTop = songScrollEl.scrollHeight - songScrollEl.clientHeight;
    stopAutoScroll();
    return;
  }

  requestAnimationFrame(stepAutoScroll);
}

function updateAutoScrollButtons() {
  scrollPlayBtn.disabled = autoScrollActive || !currentSong;
  scrollPauseBtn.disabled = !autoScrollActive;
}

transposeUpBtn.addEventListener('click', () => {
  transposeSteps += 1;
  updateControlDisplays();
  if (currentSong) renderSong(currentSong);
});

transposeDownBtn.addEventListener('click', () => {
  transposeSteps -= 1;
  updateControlDisplays();
  if (currentSong) renderSong(currentSong);
});

zoomInBtn.addEventListener('click', () => {
  zoomPercent = Math.min(zoomPercent + 10, 200);
  updateControlDisplays();
  updateZoom();
});

zoomOutBtn.addEventListener('click', () => {
  zoomPercent = Math.max(zoomPercent - 10, 60);
  updateControlDisplays();
  updateZoom();
});

toggleSidebarBtn.addEventListener('click', toggleSidebar);

scrollPlayBtn.addEventListener('click', startAutoScroll);
scrollPauseBtn.addEventListener('click', stopAutoScroll);
songScrollEl.addEventListener('pointerdown', stopAutoScroll);
songScrollEl.addEventListener('wheel', stopAutoScroll, { passive: true });

searchInput.addEventListener('input', (event) => filterSongs(event.target.value));
reloadBtn.addEventListener('click', fetchSongs);

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => handleSongContent(e.target.result, file.name);
  reader.readAsText(file);
  fileInput.value = '';
});

fetchSongs();
