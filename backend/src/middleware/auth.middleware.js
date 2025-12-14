// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user; // attach user to request
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.userType !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { auth, adminOnly };
