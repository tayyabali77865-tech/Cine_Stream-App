const axios = require('axios');
axios.get('https://new6.filesdl.top/cloud/T4EkwPVdhx').then(res => {
  console.log(res.data);
}).catch(err => {
  console.error(err.message);
});
