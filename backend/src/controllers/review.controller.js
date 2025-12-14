// src/controllers/review.controller.js
const Review = require('../models/review.model');
const Game = require('../models/game.model');

// Helper to recalc average rating
const recalculateGameRating = async (gameId) => {
  const reviews = await Review.find({ gameId, rating: { $ne: null } });

  if (reviews.length === 0) {
    await Game.findByIdAndUpdate(gameId, {
      averageRating: 0,
      totalRatings: 0,
    });
    return;
  }

  const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  const total = reviews.length;
  const avg = sum / total;

  await Game.findByIdAndUpdate(gameId, {
    averageRating: avg,
    totalRatings: total,
  });
};

/**
 * POST /api/reviews
 * body: { gameId, text?, rating? }
 */
const createReview = async (req, res) => {
  try {
    const { gameId, text, rating } = req.body;

    if (!gameId) {
      return res.status(400).json({ error: 'gameId is required' });
    }

    if (!text && (rating === undefined || rating === null)) {
      return res.status(400).json({ error: 'Provide either text or rating' });
    }

    const review = await Review.create({
      userId: req.user._id,
      gameId,
      text,
      rating,
    });

    if (rating !== undefined && rating !== null) {
      await recalculateGameRating(gameId);
    }

    res.status(201).json({ message: 'Review added', review });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/reviews/game/:gameId
 */
const getReviewsByGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const reviews = await Review.find({ gameId })
      .populate('userId', 'username')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/reviews/:id
 */
const updateReview = async (req, res) => {
  try {
    const { text, rating } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) return res.status(404).json({ error: 'Review not found' });

    // Only the author or admin can edit
    if (review.userId.toString() !== req.user._id.toString() &&
        req.user.userType !== 'Admin') {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (text !== undefined) review.text = text;
    if (rating !== undefined) review.rating = rating;

    await review.save();
    await recalculateGameRating(review.gameId);

    res.json({ message: 'Review updated', review });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/reviews/:id
 */
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    if (review.userId.toString() !== req.user._id.toString() &&
        req.user.userType !== 'Admin') {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const gameId = review.gameId;
    await review.deleteOne();
    await recalculateGameRating(gameId);

    res.json({ message: 'Review deleted' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createReview,
  getReviewsByGame,
  updateReview,
  deleteReview,
};
