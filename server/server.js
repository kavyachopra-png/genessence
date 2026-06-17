const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const User = require('./models/User');
const seedData = require('./seed');

const app = express();

// ── CORS: allow all localhost origins & configured production frontends ───────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5180',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5176'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like curl, mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Allow localhost/127.0.0.1 development environments
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Allow explicitly defined frontend URL in production
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    
    // Allow any vercel.app subdomain for easy preview/deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error(`CORS policy: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle pre-flight OPTIONS for all routes
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logger (dev mode) ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusEmoji = res.statusCode >= 500 ? '🔴' : res.statusCode >= 400 ? '🟡' : '🟢';
      console.log(`${statusEmoji} ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

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

// Serve frontend in production (if integrated)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`[Error Handler] ${err.stack}`);
  res.status(err.status || 500).json({
    message: err.message || 'An internal server error occurred'
  });
});

// Connect to Database and Seed if empty, then start server
const PORT = process.env.PORT || 5050;

connectDB().then(async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('No users found in database. Running auto-seeding logic...');
      await seedData();
    } else {
      console.log(`Database already has ${userCount} users. Auto-seeding skipped.`);
    }
  } catch (err) {
    console.error('Error verifying database seed state:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Health: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}).catch(err => {
  console.error('Server failed to start due to database error:', err.message);
});
