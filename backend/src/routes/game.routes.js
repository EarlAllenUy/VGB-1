// src/routes/game.routes.js
const express = require('express');
const router = express.Router();
const {
  getGames,
  getGameById,
  createGame,
  updateGame,
  deleteGame,
} = require('../controllers/game.controller');
const { auth, adminOnly } = require('../middleware/auth.middleware');

// Public routes
router.get('/', getGames);
router.get('/:id', getGameById);

// Admin-only routes
router.post('/', auth, adminOnly, createGame);
router.put('/:id', auth, adminOnly, updateGame);
router.delete('/:id', auth, adminOnly, deleteGame);

module.exports = router;
