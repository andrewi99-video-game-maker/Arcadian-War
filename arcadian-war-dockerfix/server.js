// server.js - Serves the Hyperswag Arena game and relays multiplayer messages.
//
// The game's client code opens a same-origin WebSocket ("net.init()" in the
// game) to sync players in "online" mode. Without a server on the other end,
// that connection just fails and the game falls back to BroadcastChannel
// (which only works between tabs in the same browser, not real multiplayer).
// This server provides that missing WebSocket endpoint, plus serves the
// game's HTML file itself, so a single Docker container can do both jobs.

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const GAME_FILE = path.join(__dirname, 'public', 'index.html');
const html = fs.readFileSync(GAME_FILE, 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

const wss = new WebSocket.Server({ server });

// clientId -> { ws, name }
const clients = new Map();

function broadcast(msg, exceptWs) {
  const data = JSON.stringify(msg);
  for (const { ws } of clients.values()) {
    if (ws !== exceptWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  let clientId = null;
  let clientName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'join':
        clientId = msg.id;
        clientName = msg.name;
        clients.set(clientId, { ws, name: clientName });
        broadcast({ type: 'player_join', id: clientId, name: clientName }, ws);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', clientTime: msg.time }));
        break;

      case 'player_leave':
        if (msg.id) {
          clients.delete(msg.id);
          broadcast({ type: 'player_leave', id: msg.id, name: msg.name }, ws);
        }
        break;

      // state, action, status, snowball_throw, hit, kill all just get
      // relayed to every other connected player as-is.
      default:
        broadcast(msg, ws);
        break;
    }
  });

  ws.on('close', () => {
    if (clientId) {
      const name = clientName;
      clients.delete(clientId);
      broadcast({ type: 'player_leave', id: clientId, name });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Hyperswag Arena listening on port ${PORT}`);
});
