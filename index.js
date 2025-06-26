const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');

// Load certs (replace with correct filenames if needed)
const cert = Buffer.from(process.env.CERT, 'utf-8');
const key = Buffer.from(process.env.KEY, 'utf-8');

// Gold-i WebSocket URL — placeholder format, replace when known
const goldiURL = 'wss://host.tradefarm.matrixnet.gold-i.com:40007'; // Ask Gold-i for this!

const goldiWS = new WebSocket(goldiURL, {
  cert,
  key,
  rejectUnauthorized: false // only if self-signed (for testing)
});

// Our own WebSocket server for Framer to connect
const wss = new WebSocket.Server({ port: 8080 });

let latestData = null;

goldiWS.on('open', () => {
  console.log('Connected to Gold-i WebSocket');

  // Send subscription message if required
  goldiWS.send(JSON.stringify({
    action: "subscribe",
    username: "tradefarm",
    password: "(+om47(hneT3l,G!\\B!-",
    // add instruments or symbols here if needed
  }));
});

goldiWS.on('message', (data) => {
  latestData = data.toString();
  console.log('Received from Gold-i:', latestData);

  // Broadcast to all Framer clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(latestData);
    }
  });
});

wss.on('connection', (ws) => {
  console.log('Framer frontend connected');
  if (latestData) {
    ws.send(latestData); // send latest snapshot
  }
});

console.log('Relay WebSocket server running on ws://localhost:8080');
