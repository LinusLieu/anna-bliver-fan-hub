const WebSocket = require('ws');
const pointsService = require('./pointsService');

let socket = null;
let retryTimer = null;
let retryAttempt = 0;

function sendAck(eventId, status, reason = '') {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'event_ack', event_id: eventId, status, reason }));
}

async function handleMessage(raw) {
  let event;
  try {
    event = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (!['gift', 'super_chat'].includes(event.type)) return;
  try {
    const result = await pointsService.ingestBilibiliPointEvent(event);
    sendAck(event.event_id, result.duplicate ? 'duplicate' : 'accepted');
  } catch (error) {
    sendAck(event.event_id, 'rejected', error.message);
  }
}

function connect() {
  const url = String(process.env.BOT_WS_URL || '').trim();
  if (!url) return;
  const headers = process.env.BOT_WS_TOKEN ? { Authorization: `Bearer ${process.env.BOT_WS_TOKEN}` } : {};
  socket = new WebSocket(url, { headers });
  socket.on('open', () => {
    retryAttempt = 0;
    socket.send(JSON.stringify({ type: 'resume', settled_before: new Date().toISOString() }));
  });
  socket.on('message', handleMessage);
  socket.on('error', (error) => console.error('[bot-ws] connection error:', error.message));
  socket.on('close', () => {
    socket = null;
    const delay = Math.min(30000, 1000 * (2 ** retryAttempt++));
    retryTimer = setTimeout(connect, delay);
  });
}

function startBotEventBridge() {
  if (!process.env.BOT_WS_URL) {
    console.log('[bot-ws] disabled; BOT_WS_URL is not configured');
    return false;
  }
  connect();
  return true;
}

function stopBotEventBridge() {
  if (retryTimer) clearTimeout(retryTimer);
  if (socket) socket.close();
  socket = null;
}

module.exports = { startBotEventBridge, stopBotEventBridge, handleMessage };
