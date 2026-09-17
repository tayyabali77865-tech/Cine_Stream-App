const axios = require('axios');
const crypto = require('crypto');

async function analyzeBundle() {
  const scriptUrl = 'https://netmirror.center/assets/index-f42cfd97.js';
  const scriptRes = await axios.get(scriptUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://netmirror.center/' }
  });
  const code = scriptRes.data;
  
  // Search for data-fp usage
  const fpIdx = code.indexOf('data-fp');
  if (fpIdx !== -1) {
    console.log('=== data-fp context ===\n', code.slice(Math.max(0, fpIdx - 500), fpIdx + 500));
  }
  
  // Search for "fp" in URL building context
  const watchboxIdx = code.lastIndexOf('watchbox.php');
  const block = code.slice(Math.max(0, watchboxIdx - 3000), watchboxIdx + 500);
  
  // Find all token/fp references  
  const fpRefs = block.match(/fp['"&?=][^'"&\s]{0,50}/g) || [];
  console.log('\n=== fp refs near watchbox ===');
  fpRefs.forEach(x => console.log(x));
  
  // Find "kg" - the fingerprint prefix pattern
  const kgRefs = block.match(/kg[A-Za-z0-9]+/g) || [];
  console.log('\n=== kg refs near watchbox ===');
  kgRefs.forEach(x => console.log(x));
  
  // Print 2000 chars context  before watchbox url building
  console.log('\n=== 2000 chars before watchbox.php ===');
  console.log(code.slice(Math.max(0, watchboxIdx - 2000), watchboxIdx));
}
analyzeBundle().catch(console.error);
