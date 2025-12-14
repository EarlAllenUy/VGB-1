// src/models/favorite.model.js
const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
  },
  dateAdded: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Favorite', favoriteSchema);
