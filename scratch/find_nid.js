const axios = require('axios');
async function findYeCall() {
  const scriptUrl = 'https://netmirror.center/assets/index-f42cfd97.js';
  const scriptRes = await axios.get(scriptUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://netmirror.center/' }});
  const code = scriptRes.data;
  
  // Find where ye() function is called - this will show us what Qt (nid) is
  const yeCallIdx = code.indexOf('ye(e,');
  if (yeCallIdx !== -1) {
    console.log('ye() call:\n', code.slice(Math.max(0, yeCallIdx-100), yeCallIdx+800));
  }
  
  // Also search for 'subjectid' usage
  const subjectIdx = code.indexOf('subjectid');
  if (subjectIdx !== -1) {
    console.log('\n\nsubjectid context:\n', code.slice(Math.max(0, subjectIdx-200), subjectIdx+400));
  }
}
findYeCall().catch(console.error);
