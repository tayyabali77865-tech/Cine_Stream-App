const axios = require('axios');
const url = 'https://netmirror.global/assets/index-794a1aad.js';
axios.get(url).then(res => {
  const code = res.data;
  const patterns = ['Did You Mean', 'did-you-mean', 'didYouMean', 'did_you_mean', 'spellcheck', 'spell_check', 'SpellCheck', 'correction', 'Correction'];
  patterns.forEach(p => {
    let idx = 0;
    while ((idx = code.indexOf(p, idx)) !== -1) {
      console.log('[' + p + '] at ' + idx + ':', code.substring(idx-80, idx+200));
      console.log('---');
      idx += p.length;
    }
  });
  console.log('done searching');
});
