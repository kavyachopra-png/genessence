const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { roleToDb, serializeUser } = require('../utils/serializers');
const { protect, authorize } = require('../middleware/auth');

// Log the full error (object + stack) to the server console for debugging.
// The stack is logged server-side only — never sent to the client.
const logError = (context, err) => {
  console.error(`🔴 [auth] ${context} failed:`, err);
  if (err && err.stack) console.error(err.stack);
};

// Generate JWT Helper
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() }
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const safeUser = serializeUser(user);
      res.json({
        ...safeUser,
        token: generateToken(user.id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (err) {
    logError('POST /login', err);
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  res.json(req.user);
});

// @route   POST api/auth/users
// @desc    Create a new user (Admin only)
// @access  Private/Admin
router.post('/users', protect, authorize('admin'), async (req, res) => {
  const { name, email, password, role } = req.body;
  
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const userExists = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() }
    });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        password: hashedPassword,
        role: roleToDb(role)
      }
    });
    res.status(201).json(serializeUser(user));
  } catch (err) {
    logError('POST /users', err);
    res.status(500).json({ message: err.message });
  }
});

// @route   GET api/auth/users
// @desc    Get all users (Admin only)
// @access  Private/Admin
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(users.map(serializeUser));
  } catch (err) {
    logError('GET /users', err);
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE api/auth/users/:id
// @desc    Delete user (Admin only)
// @access  Private/Admin
router.delete('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent admin from deleting themselves
    if (user.id === req.user._id) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User removed successfully' });
  } catch (err) {
    logError('DELETE /users/:id', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
