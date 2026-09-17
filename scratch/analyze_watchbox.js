const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\e088d331-8a04-4317-8a63-d46f6bea0932\\scratch\\watchbox_success.html', 'utf8');

console.log('r2Match:', html.match(/(https?:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+)/) ? true : false);
console.log('mediaMatch:', html.match(/(https?:\/\/[^\'\"]+\.(mp4|m3u8|mkv)[^\'\"]*)/) ? true : false);

const scriptMatches = html.match(/<script.*?>([\s\S]*?)<\/script>/gi);
if (scriptMatches) {
  scriptMatches.forEach(s => {
    if (s.includes('file:') || s.includes('.m3u8') || s.includes('.mp4') || s.includes('sources:')) {
      console.log('\nScript containing media config:\n', s.slice(0, 500) + '...');
    }
  });
}

const urls = html.match(/https?:\/\/[^\s\'\"<>]+/g) || [];
console.log('\nPotential video URLs in HTML:');
urls.filter(u => u.includes('mp4') || u.includes('m3u8') || u.includes('.dev') || u.includes('cdn') || u.includes('master.txt')).forEach(u => console.log(u));
