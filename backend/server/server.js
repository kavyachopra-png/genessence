const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const prisma = require('./lib/prisma');
const seedData = require('./seed');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────
// Allowed production origins come from FRONTEND_URL (comma-separated for
// multiple, e.g. "https://genessenceos-1.onrender.com"). In development we also
// allow any localhost / 127.0.0.1 port. We never use origin:"*" — credentials
// are enabled, so each allowed origin is reflected explicitly.
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.warn('WARNING: FRONTEND_URL is not set — browser cross-origin requests will be blocked in production.');
}

const corsOptions = {
  origin(origin, callback) {
    // No Origin header (curl, health checks, server-to-server) → allow.
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/+$/, '');

    // Development convenience: any localhost / 127.0.0.1 port.
    if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
      return callback(null, true);
    }

    // Explicitly configured frontend origin(s) — the only ones allowed in prod.
    if (allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger (all environments) ───────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusEmoji = res.statusCode >= 500 ? '🔴' : res.statusCode >= 400 ? '🟡' : '🟢';
    console.log(`${statusEmoji} ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Serve static uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/documents', require('./routes/documents'));

// Basic Health Check Route
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    message: 'Genessence Server is healthy and running',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 5050
  });
});

// API-only service: the frontend is deployed as a separate Render service, so we
// do NOT serve a frontend build here. Unmatched routes return a JSON 404.
app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler — logs full error details server-side; never leaks the
// stack trace to the client (the client only receives the message).
app.use((err, req, res, next) => {
  console.error(`🔴 [Error Handler] ${req.method} ${req.originalUrl}`);
  console.error(`   name:    ${err.name}`);
  console.error(`   message: ${err.message}`);
  if (err.code) console.error(`   code:    ${err.code}`); // e.g. Prisma P1001 (DB unreachable), P2021 (table missing)
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'An internal server error occurred'
  });
});

// Connect to Database and Seed if empty, then start server
const PORT = process.env.PORT || 5050;

const startServer = async () => {
  // Fail closed: a missing JWT secret means tokens cannot be safely signed or
  // verified. Refuse to boot rather than fall back to a guessable default.
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not set. Refusing to start — set JWT_SECRET in the environment.');
    process.exit(1);
  }

  try {
    const shouldSeed = !isProduction || process.env.SEED_DATABASE === 'true';

    if (shouldSeed) {
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        console.log('No users found in database. Running auto-seeding logic...');
        await seedData();
      } else {
        console.log(`Database already has ${userCount} users. Auto-seeding skipped.`);
      }
    } else {
      console.log('Database auto-seeding skipped (disabled in production unless SEED_DATABASE=true).');
    }
  } catch (err) {
    console.error('Error verifying database seed state:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📋 Health check available at /health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
};

startServer().catch((err) => {
  console.error('Server failed to start due to database error:', err.message);
  process.exit(1);
});

const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Closing Prisma connection...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
