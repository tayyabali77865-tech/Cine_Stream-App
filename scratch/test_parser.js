const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\e088d331-8a04-4317-8a63-d46f6bea0932\\scratch\\watchbox_success.html', 'utf8');

function parseWatchboxHtml(html) {
  const bcdnMatch = html.match(/(https:\/\/[a-zA-Z0-9.-]+\.hakunaymatata\.com\/[^\'\"]+\.mp4\?[^\'\"]+)/);
  if (bcdnMatch) return bcdnMatch[1];
  
  const r2Match = html.match(/(https:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+\?[^\'\"]+)/);
  if (r2Match) return r2Match[1];
  
  return null;
}

console.log('Result:', parseWatchboxHtml(html));
