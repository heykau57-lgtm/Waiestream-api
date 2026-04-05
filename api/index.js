const axios = require('axios');

const TMDB_KEY = 'c3ed3120959a25aaf6ea83a9ea4efec8';
const OS_KEY = '7QRiCzFftTIuPfEG4LNe0SjXAqjTOHiT';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// CORS headers
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function tmdbGet(path, params = '') {
  try {
    const url = `${TMDB_BASE}${path}?api_key=${TMDB_KEY}&language=en-US${params}`;
    const res = await axios.get(url, { timeout: 10000 });
    return res.data;
  } catch (e) { return null; }
}

async function fetchSubtitle(title, year, isTV) {
  try {
    const type = isTV ? 'episode' : 'movie';
    const query = encodeURIComponent(title);
    let searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${query}&languages=ms,en&type=${type}`;
    if (year) searchUrl += `&year=${year}`;
    const headers = {
      'Api-Key': OS_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'WaieStream v1'
    };
    const searchRes = await axios.get(searchUrl, { headers, timeout: 10000 });
    const data = searchRes.data?.data || [];
    if (!data.length) return null;
    let chosen = data.find(s => s.attributes.language === 'ms') || data[0];
    const lang = chosen.attributes.language;
    const fileId = chosen.attributes.files[0].file_id;
    const dlRes = await axios.post(
      'https://api.opensubtitles.com/api/v1/download',
      { file_id: fileId },
      { headers, timeout: 10000 }
    );
    const link = dlRes.data?.link;
    if (!link) return null;
    const srtRes = await axios.get(link, { timeout: 15000 });
    return { language: lang, languageName: lang === 'ms' ? 'Melayu' : 'English', content: srtRes.data };
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  // Set CORS
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.url || '/';
  const params = req.query || {};

  // Root
  if (path === '/' || path === '/api') {
    return res.json({ status: 'ok', name: 'WaieStream API', version: '1.0' });
  }

  // Trending
  if (path.startsWith('/api/trending')) {
    const data = await tmdbGet('/trending/all/week');
    return res.json(data || { results: [] });
  }

  // Search
  if (path.startsWith('/api/search')) {
    const q = params.q;
    if (!q) return res.status(400).json({ error: 'Query diperlukan' });
    const [movies, tvs] = await Promise.all([
      tmdbGet('/search/movie', `&query=${encodeURIComponent(q)}`),
      tmdbGet('/search/tv', `&query=${encodeURIComponent(q)}`)
    ]);
    const results = [
      ...(movies?.results || []).map(x => ({ ...x, media_type: 'movie' })),
      ...(tvs?.results || []).map(x => ({ ...x, media_type: 'tv' }))
    ].filter(x => x.poster_path).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return res.json({ query: q, results: results.slice(0, 30) });
  }

  // Sources
  if (path.startsWith('/api/sources/')) {
    const id = path.split('/api/sources/')[1];
    const isTV = params.tv === 'true';
    const type = isTV ? 'tv' : 'movie';
    const sources = [
      { name: 'Sumber 1', url: `https://vidsrc.xyz/embed/${type}/${id}` },
      { name: 'Sumber 2', url: `https://embed.su/embed/${type}/${id}` },
      { name: 'Sumber 3', url: `https://moviesapi.club/${type}/${id}` },
      { name: 'Sumber 4', url: `https://www.2embed.cc/embed/${id}` },
    ];
    return res.json({ id, isTV, sources });
  }

  // Subtitle
  if (path.startsWith('/api/subtitle')) {
    const { title, year, tv } = params;
    if (!title) return res.status(400).json({ error: 'Title diperlukan' });
    const sub = await fetchSubtitle(title, year, tv === 'true');
    if (!sub) return res.status(404).json({ error: 'Subtitle tidak dijumpai' });
    if (path.includes('/srt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(sub.content);
    }
    return res.json({ title, language: sub.language, languageName: sub.languageName, content: sub.content });
  }

  // Movie detail
  if (path.startsWith('/api/movie/')) {
    const id = path.split('/api/movie/')[1];
    const data = await tmdbGet(`/movie/${id}`, '&append_to_response=credits,videos');
    if (!data) return res.status(404).json({ error: 'Tidak dijumpai' });
    return res.json(data);
  }

  // TV detail
  if (path.startsWith('/api/tv/')) {
    const id = path.split('/api/tv/')[1];
    const data = await tmdbGet(`/tv/${id}`, '&append_to_response=credits,videos');
    if (!data) return res.status(404).json({ error: 'Tidak dijumpai' });
    return res.json(data);
  }

  // Popular
  if (path.startsWith('/api/popular')) {
    const type = params.type || 'movie';
    const page = params.page || 1;
    const data = await tmdbGet(`/${type}/popular`, `&page=${page}`);
    return res.json(data || { results: [] });
  }

  return res.status(404).json({ error: 'Endpoint tidak dijumpai' });
};

