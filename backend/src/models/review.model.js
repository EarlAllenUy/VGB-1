// src/models/review.model.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
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
  text: String,
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  datePosted: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Review', reviewSchema);
