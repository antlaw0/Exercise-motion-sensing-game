'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Track active clients by role
const clients = { game: null, left: null, right: null };

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

wss.on('connection', (ws) => {
  let role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'register':
        role = msg.role; // 'game' | 'left' | 'right'
        if (!['game', 'left', 'right'].includes(role)) {
          ws.close();
          return;
        }
        clients[role] = ws;
        console.log(`[ws] ${role} client registered`);
        ws.send(JSON.stringify({ type: 'registered', role }));

        // Tell the game when a controller connects
        if (role !== 'game' && clients.game && clients.game.readyState === 1) {
          clients.game.send(
            JSON.stringify({ type: 'controller_connected', hand: role })
          );
        }
        break;

      case 'action':
        // Controller → game: { type:'action', action:'punch'|'guard_on'|'guard_off', force }
        if (clients.game && clients.game.readyState === 1) {
          clients.game.send(
            JSON.stringify({ type: 'action', hand: role, action: msg.action, force: msg.force })
          );
        }
        break;

      case 'motion':
        // Raw motion telemetry, relay to game for optional processing
        if (clients.game && clients.game.readyState === 1) {
          clients.game.send(
            JSON.stringify({ type: 'motion', hand: role, acc: msg.acc })
          );
        }
        break;

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (role && clients[role] === ws) {
      clients[role] = null;
      console.log(`[ws] ${role} client disconnected`);
      if (role !== 'game' && clients.game && clients.game.readyState === 1) {
        clients.game.send(
          JSON.stringify({ type: 'controller_disconnected', hand: role })
        );
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[ws] error:', err.message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`\n🥊 Boxing Trainer server running`);
  console.log(`   Game:       http://localhost:${PORT}`);
  console.log(`   Game (LAN): http://${ip}:${PORT}`);
  console.log(`   Phone ctrl: http://${ip}:${PORT}/controller.html`);
  console.log(`\nConnect your phone to the same WiFi and open the Phone ctrl URL.\n`);
});
