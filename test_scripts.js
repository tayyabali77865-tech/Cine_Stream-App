const axios = require('axios');

async function getHtml() {
  try {
    const url = 'https://limit.watch22.shop/play/watchbox.php?id=112234&se=1&ep=1&dp=1&na=&nid=112234&exten=false&tv=&token=&ts=0&sig=0';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://netmirror.global/'
      }
    });
    console.log(res.data);
  } catch (e) {
    console.error(e.message);
  }
}
getHtml();
