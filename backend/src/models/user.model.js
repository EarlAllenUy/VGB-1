// src/models/user.model.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true, // store hashed password
  },
  userType: {
    type: String,
    enum: ['Registered', 'Admin'],
    default: 'Registered',
  },
  registrationDate: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);
