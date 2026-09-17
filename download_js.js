const fs = require('fs');
const https = require('https');
https.get('https://netmirror.center/assets/index-f42cfd97.js', res => {
  const file = fs.createWriteStream('netmirror_app.js');
  res.pipe(file);
  file.on('finish', () => console.log('Downloaded'));
});
