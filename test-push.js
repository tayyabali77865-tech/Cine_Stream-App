require('dotenv').config();
const db = require('./services/mongoService');

async function testPush() {
  try {
    const tokens = await db.getAllPushTokens();
    console.log('Tokens found:', tokens);
    
    if (!tokens || tokens.length === 0) {
      console.log('No devices registered.');
      process.exit(0);
    }

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: 'Debug Notification',
      body: 'This is a test notification from debugging script.',
      priority: 'high',
      channelId: 'default',
      data: { test: '123' },
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const data = await response.json();
    console.log('Expo API Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testPush();
