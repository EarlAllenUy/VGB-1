// src/controllers/game.controller.js
const Game = require('../models/game.model');
const Review = require('../models/review.model');

/**
 * GET /api/games
 * Optional query params: search, platform, genre, status
 */
const getGames = async (req, res) => {
  try {
    const { search, platform, genre, status } = req.query;
    const filter = {};

    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    if (platform) {
      filter.platform = platform; // e.g. "PC"
    }

    if (genre) {
      filter.genre = genre; // e.g. "RPG"
    }

    if (status) {
      filter.status = status; // "Upcoming" or "Released"
    }

    const games = await Game.find(filter).sort({ releaseDate: -1 });
    res.json(games);
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/games/:id
 */
const getGameById = async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // optional: also load reviews
    const reviews = await Review.find({ gameId: game._id }).populate('userId', 'username');

    res.json({ game, reviews });
  } catch (error) {
    console.error('Get game by id error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/games  (admin only)
 */
const createGame = async (req, res) => {
  try {
    let { title, description, releaseDate, platform, genre, imageURL, status } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Allow comma-separated strings from simple forms
    if (typeof platform === 'string') {
      platform = platform.split(',').map(p => p.trim());
    }
    if (typeof genre === 'string') {
      genre = genre.split(',').map(g => g.trim());
    }

    const game = await Game.create({
      title,
      description,
      releaseDate,
      platform,
      genre,
      imageURL,
      status,
      averageRating: 0,
      totalRatings: 0,
    });

    res.status(201).json({ message: 'Game created', game });
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/games/:id  (admin only)
 */
const updateGame = async (req, res) => {
  try {
    let { platform, genre, ...rest } = req.body;

    const update = { ...rest };

    if (typeof platform === 'string') {
      update.platform = platform.split(',').map(p => p.trim());
    } else if (Array.isArray(platform)) {
      update.platform = platform;
    }

    if (typeof genre === 'string') {
      update.genre = genre.split(',').map(g => g.trim());
    } else if (Array.isArray(genre)) {
      update.genre = genre;
    }

    const game = await Game.findByIdAndUpdate(req.params.id, update, { new: true });

    if (!game) return res.status(404).json({ error: 'Game not found' });

    res.json({ message: 'Game updated', game });
  } catch (error) {
    console.error('Update game error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/games/:id  (admin only)
 */
const deleteGame = async (req, res) => {
  try {
    const game = await Game.findByIdAndDelete(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Optional: also delete related reviews and favorites
    await Review.deleteMany({ gameId: game._id });

    res.json({ message: 'Game deleted' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getGames,
  getGameById,
  createGame,
  updateGame,
  deleteGame,
};
