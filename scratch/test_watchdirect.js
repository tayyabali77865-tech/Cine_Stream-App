const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');

const secret = 'net###@@sss';

async function run() {
  const url = "QKZ/2Xq4PHpzhQOw7OokpVyO/CelypDWypWizCvgqJKHIzbrxHsb0tX4kpmvivp9Xec8cLEESVzLADps5sp7Uu1/Am/A/GiR2nNcfoImM7UEqAKUn6gUpLORcROXyUn3zT3RQHBjTxLjnUJBGO4wNUR/9SwsBvxgv6cRvZFIqUZOZEtNZXifBDePRPKMJ/DssKaLMZ0rTWVhF81ntVJ2pU3YP5TYcoDrH4yr=0";
  const name = "watchdirect";

  const domain = 'speed.watch22.shop';
  // Let's use the exact url from the JSON details:
  const jsonUrl = "QKZ/2Xq4PHpzhQOw7OokpVyO/CelypDWypWizCvgqJKHIzbrxHsb0tX4kpmvivp9Xec8cLEESVzLADps5sp7Uu1/Am/A/GiR2nNcfoImM7UEqAKUn6gUpLORcROXyUn3zT3RQHBjTxLjnUJBGO4wNUR/9SwsBvxgv6cRvZFIqUZOZEtNZXifBDePRPKMJ/DssKaLMZ0rTWVhF81ntVJ2pU3YP5TYcoDrH4yrrKFifW6pD8/rfhi/dV6cWO9WjOkyWAW/YTCVYQ0gx+y7aB0DJk5T5TZYKzxBMZpbeuaOInrgpIpN7wqBBmiAhkfEknWVLUOP6Vm8nb5ZGkN+QlRk96sQm1Uei7iv5pmZdSD5Pro02i7MVavcA9s6GsuTCaUE1W5Y0gs55uZGHMJ6jRJy6tjk1s1baFwxG8aJ6vI4L4sFrLN667YU1+zEOk2PI21Rr3nRs2sBenZwPqVPHQiRbYFlCzUofvuzDD6a28NPY5ZR12DDTHBpx78eBAv3KQuNnbxA1tXR/R+m0v8gwuntj8UhAVoYCO8A8QUXhkXu4bhRCkod+Iqfo5lX610rlp+xcruyMlk7+djSwJ8y5KLS5dTnlvOmleZ/65uIPOAbwMyhBxfbOXZRSHqeejtqsvkb";
  const watchboxBaseUrl = `https://${domain}/play/${name}.php?url=${encodeURIComponent(jsonUrl)}&size=2.4Gb&se=0&ep=0&name=${encodeURIComponent(name)}&exten=1`;
  const referer = 'https://netmirror.global/';

  try {
    const dummyUrl = `${watchboxBaseUrl}&ts=0&sig=0`;
    const dummyRes = await axios.get(dummyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
      }
    });

    const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
    if (!timeMatch) {
      console.log('No time match');
      return;
    }

    const serverTime = timeMatch[1];
    const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
    const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;

    const authRes = await axios.get(authUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
      }
    });

    const html = authRes.data;
    const $ = cheerio.load(html);
    const sourceSrc = $('video source').attr('src');
    console.log('video source src:', sourceSrc);

    const bcdnMatch = html.match(/(https:\/\/[a-zA-Z0-9.-]+\.hakunaymatata\.com\/[^\'\"]+\.mp4\?[^\'\"]+)/);
    console.log('bcdn regex match:', bcdnMatch ? bcdnMatch[1] : 'none');

    const r2Match = html.match(/(https:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+\?[^\'\"]+)/);
    console.log('r2 regex match:', r2Match ? r2Match[1] : 'none');

    // Print all matches of https://
    const links = html.match(/https:\/\/[^\'\"]+/g);
    console.log('All https links found:', links ? links.filter(l => l.includes('mp4') || l.includes('m3u8')) : 'none');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
