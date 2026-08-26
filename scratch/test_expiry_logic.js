const url1 = "https://macdn.hakunaymatata.com/cms/14.mp4?Expires=1786097716&Signature=abc";
const url2 = "https://macdn.hakunaymatata.com/cms/14.mp4?Expires=1999999999&Signature=abc"; // far future
const url3 = "https://example.com/video.mp4"; // no expiry
const url4 = "/relative/path/video.mp4"; // relative

function isUrlExpired(url) {
  if (!url || typeof url !== 'string') return true;
  try {
    const parsed = new URL(url);
    const expiresParam = parsed.searchParams.get('Expires') || parsed.searchParams.get('expires') || parsed.searchParams.get('expiry') || parsed.searchParams.get('exp');
    if (expiresParam) {
      const expiresVal = parseInt(expiresParam, 10);
      if (!isNaN(expiresVal)) {
        const expiresMs = expiresVal < 10000000000 ? expiresVal * 1000 : expiresVal;
        if (Date.now() + 30000 > expiresMs) {
          console.log(`⚠️ URL check: Link has expired (Expiry: ${new Date(expiresMs).toISOString()}, Current: ${new Date().toISOString()})`);
          return true;
        }
      }
    }
  } catch (e) {
    // Ignore invalid URL
  }
  return false;
}

console.log("url1 (expired):", isUrlExpired(url1));
console.log("url2 (future):", isUrlExpired(url2));
console.log("url3 (no expiry):", isUrlExpired(url3));
console.log("url4 (relative):", isUrlExpired(url4));
