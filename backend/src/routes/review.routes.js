// src/routes/review.routes.js
const express = require('express');
const router = express.Router();
const {
  createReview,
  getReviewsByGame,
  updateReview,
  deleteReview,
} = require('../controllers/review.controller');
const { auth } = require('../middleware/auth.middleware');

// Public: anyone can view reviews for a game
router.get('/game/:gameId', getReviewsByGame);

// Auth required: create/edit/delete
router.post('/', auth, createReview);
router.put('/:id', auth, updateReview);
router.delete('/:id', auth, deleteReview);

module.exports = router;
