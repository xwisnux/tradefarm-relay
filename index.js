const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// Load certs from Railway env vars
const cert = Buffer.from(process.env.CERT, 'utf-8');
const key = Buffer.from(process.env.KEY, 'utf-8');

// Gold-i WebSocket
const goldiURL = 'wss://instrument-prices.tradefarm.io';

const goldiWS = new WebSocket(goldiURL, {
  cert,
  key,
  rejectUnauthorized: false,
});

let latestData = null;

// Setup HTTP server + WebSocket relay
const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Framer frontend connected');
  if (latestData) ws.send(latestData);
});

goldiWS.on('open', () => {
  console.log('Connected to Gold-i');
  goldiWS.send(JSON.stringify({
    action: "subscribe",
    username: "tradefarm",
    password: "(+om47(hneT3l,G!\\B!-",
  }));
});

goldiWS.on('message', (msg) => {
  const latestData = msg.toString();
  console.log('From Gold-i:', latestData);
});

goldiWS.on('error', (err) => {
  console.error('❌ Error connecting to Gold-i:', err);
});

// Start server on Railway's assigned port
const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Relay server live on port ${port}`);
});
