// src/routes/favorite.routes.js
const express = require('express');
const router = express.Router();
const {
  addFavorite,
  getFavorites,
  removeFavorite,
} = require('../controllers/favorite.controller');
const { auth } = require('../middleware/auth.middleware');

// All favorite actions require login
router.post('/', auth, addFavorite);
router.get('/', auth, getFavorites);
router.delete('/:gameId', auth, removeFavorite);

module.exports = router;
