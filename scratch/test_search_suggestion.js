const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const allNetmirrorMirrors = ['https://api2.imdb3.shop/api', 'https://api2.imdb4.shop/api'];

async function searchMedia(query, page = 0) {
  const decodedQuery = decodeURIComponent(query);
  let cleaned = decodedQuery.toLowerCase();
  cleaned = cleaned.replace(/\[.*?\]/g, ' ');
  cleaned = cleaned.replace(/\(.*?\)/g, ' ');
  cleaned = cleaned.replace(/\b(s\d+|season\s*\d+|part\s*\d+)\b/gi, ' ');
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  const queryToSearch = cleaned || decodedQuery.trim();
  const formattedQuery = encodeURIComponent(queryToSearch).replace(/%20/g, '+');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.center/',
    'Origin': 'https://netmirror.center'
  };

  console.log('Searching for queryToSearch:', queryToSearch);
  console.log('Formatted Query:', formattedQuery);

  const promises = allNetmirrorMirrors.map(async (mirror) => {
    const url = `${mirror}/search2/${formattedQuery}?page=${page}`;
    console.log('Fetching:', url);
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) return [];
      const rawData = await response.json();
      return rawData.results || [];
    } catch (err) {
      console.log('Error:', err.message);
      return [];
    }
  });

  const results = await Promise.all(promises);
  console.log('Results lengths:', results.map(r => r.length));
  return results;
}

searchMedia("Naruto [Hindi]").then(() => {
  console.log('Done');
});
