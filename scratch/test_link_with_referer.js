const axios = require('axios');

async function run() {
  const url = "https://macdn.hakunaymatata.com/cms/14e9cbdbc13164a5edd510fc4f8ae63a.mp4?Expires=1786097716&Signature=xM~gwmICcYbwf3N5V-laFE~8JUb9DNHXOloENrbG-me7MX4A32MVZBFt~Hwu92ly8IdhXm7ulGW4zXhkeh5wRYu-h114j1yP9EyDcL886brW8OdRnoQkH8qLUo5rVvDSGsTwHSUlbjkV~vg6DGgWR17XRbK5zpo0y~2lqATZel7zXHXjS3NmRduMzzvE~klQTPyTzdmDn1rYsspyooLBBOZhFToYkH9S5VnsAGwMIGVKcEIgQQufjpThUTL47pgbCRmbATDdbeusVnWuyRQXveRg3roE-IDsjddRfeJAkralVbdhKHTp2Mo7B2veKaFdLToqfdXxsM4fX0YBPpko1w__&Key-Pair-Id=KMHN1LQ1HEUPL";
  
  const referers = [
    'https://netmirror.global/',
    'https://netmirror.center/',
    'https://speed.watch22.shop/',
    'https://fmoviesunblocked.net/',
    '' // no referer
  ];

  for (const referer of referers) {
    try {
      console.log(`Testing with Referer: "${referer}"...`);
      const res = await axios.head(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(referer ? { 'Referer': referer } : {})
        },
        timeout: 5000
      });
      console.log(`✅ SUCCESS (200) with Referer: "${referer}"!`);
      return;
    } catch (err) {
      console.log(`❌ Failed with Referer: "${referer}": ${err.response ? err.response.status : err.message}`);
    }
  }
}

run();
