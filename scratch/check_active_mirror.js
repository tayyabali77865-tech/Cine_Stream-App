const { DynamicMirrorManager } = require('../services/cacheService');
const dns = require('dns');
require('dotenv').config();

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn(err.message);
}

async function run() {
  const defaultMirrors = (process.env.DEFAULT_API_DOMAINS || '').split(',');
  const netmirrorHomeUrl = process.env.NETMIRROR_HOME_URL || 'https://netmirror.global/';

  const mirrorManager = new DynamicMirrorManager({
    defaultMirrors,
    netmirrorHomeUrl,
    checkIntervalMs: 300000
  });

  console.log('Discovering and testing mirrors...');
  await mirrorManager.discoverAndTestMirrors();
  console.log('Active primary mirror:', mirrorManager.getActiveMirror());
  console.log('Search mirrors:', mirrorManager.getSearchMirrors());
  console.log('Filter mirrors:', mirrorManager.getMirrors());
}

run();
