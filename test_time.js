const axios = require('axios');
const domain = 'limit.watch22.shop';
const watchboxBaseUrl = 'https://' + domain + '/play/watchbox.php?id=112234&se=1&ep=1&dp=1&na=&nid=112234&exten=false&tv=&token=';
axios.get(watchboxBaseUrl + '&ts=0&sig=0', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://netmirror.global/'
  }
}).then(res => console.log(res.data)).catch(console.error);
