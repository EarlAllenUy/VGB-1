// src/controllers/favorite.controller.js
const Favorite = require('../models/favorite.model');

const addFavorite = async (req, res) => {
  try {
    const { gameId } = req.body;
    if (!gameId) {
      return res.status(400).json({ error: 'gameId is required' });
    }

    const exists = await Favorite.findOne({
      userId: req.user._id,
      gameId,
    });

    if (exists) {
      return res.status(400).json({ error: 'Game already in favorites' });
    }

    const favorite = await Favorite.create({
      userId: req.user._id,
      gameId,
    });

    res.status(201).json({ message: 'Added to favorites', favorite });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ userId: req.user._id })
      .populate('gameId'); // gets game details too

    res.json(favorites);
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const removeFavorite = async (req, res) => {
  try {
    const { gameId } = req.params;

    await Favorite.findOneAndDelete({
      userId: req.user._id,
      gameId,
    });

    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  addFavorite,
  getFavorites,
  removeFavorite,
};
