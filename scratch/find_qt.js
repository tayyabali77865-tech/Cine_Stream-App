const axios = require('axios');
async function findContext() {
  const scriptUrl = 'https://netmirror.center/assets/index-f42cfd97.js';
  const scriptRes = await axios.get(scriptUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://netmirror.center/' }});
  const code = scriptRes.data;
  
  // Print the FULL context around watchbox URL building (the large code block that includes both embed_json and watchbox)
  // sig=n means n is the signature variable - find where n is assigned
  const watchboxIdx = code.lastIndexOf('watchbox.php?id=');
  
  // Print 6000 chars before watchbox URL construction
  console.log(code.slice(Math.max(0, watchboxIdx - 6000), watchboxIdx + 1000));
}
findContext().catch(console.error);
