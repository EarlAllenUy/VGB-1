// src/models/game.model.js
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  releaseDate: Date,
  platform: [String],  // e.g. ["PC", "PS5"]
  genre: [String],     // e.g. ["RPG", "Fantasy"]
  imageURL: String,
  status: {
    type: String,
    enum: ['Upcoming', 'Released'],
    default: 'Upcoming',
  },
  averageRating: {
    type: Number,
    default: 0,
  },
  totalRatings: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Game', gameSchema);
