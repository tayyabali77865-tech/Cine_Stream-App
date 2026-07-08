const axios = require('axios');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function test() {
  const id = '103375';
  const se = '10';
  const ep = '9';
  const dp = 'OURXd1pWZ3ZKNTJxSmxUc3NpRTZvd0RObHpIYWlEakZPbVNSQmExSFlNQnd6QmxTcTl4MEorWURxaDhMVkN4ZQ==';
  const title = 'Naruto: Shippuden [Bengali]';
  const na = Buffer.from(title).toString('base64');
  
  const watchboxBaseUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&exten=1`;
  const referer = 'https://netmirror.global/';
  
  // 1. Dummy request
  const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer
    }
  });
  
  const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
  if (!timeMatch) return;
  
  const serverTime = timeMatch[1];
  const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
  const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;
  
  const finalRes = await axios.get(authUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer
    }
  });
  
  const html = finalRes.data;
  
  // Find R2.dev or other hosts
  const r2Regex = /(https?:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+)/g;
  console.log('R2.dev links:', html.match(r2Regex));
  
  // Find mp4 or m3u8
  const mp4Regex = /(https?:\/\/[^\'\"]+\.mp4\?[^\'\"]+)/g;
  console.log('MP4 links:', html.match(mp4Regex));

  const m3u8Regex = /(https?:\/\/[^\'\"]+\.m3u8\?[^\'\"]+)/g;
  console.log('M3U8 links:', html.match(m3u8Regex));
  
  // Let's print any onclick attributes or anchor hrefs containing bcdnxw or R2
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('a, div, button').each((i, el) => {
    const onclick = $(el).attr('onclick');
    if (onclick && (onclick.includes('mp4') || onclick.includes('m3u8') || onclick.includes('bcdnxw') || onclick.includes('r2.dev'))) {
      console.log('Found onclick:', onclick);
    }
    const href = $(el).attr('href');
    if (href && (href.includes('mp4') || href.includes('m3u8') || href.includes('bcdnxw') || href.includes('r2.dev'))) {
      console.log('Found href:', href);
    }
  });

  // Print play_url js variable inside script tags
  const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/g);
  if (scripts) {
    for (const script of scripts) {
      if (script.includes('url') || script.includes('play_url') || script.includes('play')) {
        console.log('Match script:', script.substring(0, 1000));
      }
    }
  }
}

test();
