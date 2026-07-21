const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlists');
const prizeRoutes = require('./routes/prizes');
const settingsRoutes = require('./routes/settings');
const marshmallowRoutes = require('./routes/marshmallows');
const bilibiliRoutes = require('./routes/bilibili');
const bilibiliBindingRoutes = require('./routes/bilibiliBinding');
const permissionRoutes = require('./routes/permissions');
const pointsRoutes = require('./routes/points');
const pointsService = require('./services/pointsService');
const { startBotEventBridge } = require('./services/botEventBridge');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '10mb';

app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use('/uploads/prizes', express.static(path.join(__dirname, '..', 'uploads', 'prizes')));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/prizes', prizeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/marshmallows', marshmallowRoutes);
app.use('/api/bilibili', bilibiliRoutes);
app.use('/api/bilibili-binding', bilibiliBindingRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/points', pointsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
});

async function bootstrap() {
  await pointsService.ensurePointsSchema();
  await pointsService.settleBilibiliPoints();
  pointsService.scheduleDailySettlement();
  startBotEventBridge();
  app.listen(PORT, '0.0.0.0', () => console.log(`anna-bliver-fan-hub listening on ${PORT}`));
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, bootstrap };
