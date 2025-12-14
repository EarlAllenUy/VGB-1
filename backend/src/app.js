// src/app.js
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const gameRoutes = require('./routes/game.routes');
const reviewRoutes = require('./routes/review.routes');
const favoriteRoutes = require('./routes/favorite.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json()); // parse JSON bodies

// Simple health check
app.get('/', (req, res) => {
  res.json({ message: 'Video Game Bulletin API is running.' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/favorites', favoriteRoutes);

module.exports = app;
