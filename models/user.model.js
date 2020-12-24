/**
 * System and 3rd Party libs
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Config = require('../config');
const logger = require('./../services/logger');
/**
 * Schema Definition
 */

const userSchema = new Schema({
  firstName: Schema.Types.String,
  lastName: Schema.Types.String,
  email: Schema.Types.String,
  password: Schema.Types.String,
  isArchived: { type: Schema.Types.Boolean, default: false },
  resetPasswordExpires: Schema.Types.String,
  sentOTP: Schema.Types.Number,
  otpExpireTime: Schema.Types.Date,
  isVerifiedOTP: {
    type: Schema.Types.Boolean,
    default: false,
  },
  isExpired: Schema.Types.Boolean,
  organizationId: { type: Schema.Types.ObjectId, ref: 'organization' },
});

/**
 * Finds user from token
 * @param token
 */
userSchema.statics.findByToken = function (token) {
  let user = this;
  let decoded;
  let jwtSecret = Config.jwtSecret;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (e) {
    return Promise.reject({
      status: 'INVALID_TOKEN',
      message: 'Cannot decode token',
    });
  }

  return user.findOne({
    _id: decoded._id,
  });
};

/**
 * Generates Hash of the password before storing to database
 */
userSchema.pre('save', function (next) {
  let user = this;
  if (user.isModified('password')) {
    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(user.password, salt, (err, hash) => {
        user.password = hash;
        next();
      });
    });
  } else {
    next();
  }
});

/**
 * Finds user from database and compares password
 * @param email
 * @param password
 */
userSchema.statics.findByCredentials = function (email, password) {
  let user = this;
  return user.findOne({ email, isArchived: false }).then((user) => {
    if (!user) {
      return Promise.reject({
        status: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Incorrect email or password.',
      });
    }
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, user.password, (err, res) => {
        if (res === true) {
          return resolve(user);
        } else {
          logger.log.warn('Wrong Password for email:', user.email);
          return reject({
            status: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Incorrect email or password.',
          });
        }
      });
    });
  });
};

/**
 * Generates token at the time of Login call
 */
userSchema.methods.getAuthToken = function () {
  const u = this;
  const jwtSecret = Config.jwtSecret;
  const access = 'auth';
  const token = jwt
    .sign({ _id: u._id.toHexString(), access }, jwtSecret)
    .toString();
  return token;
};
userSchema.statics.sendOTP = async (user) => {
  const sentOTP = Math.floor(Math.random() * 899999 + 100000);
  const otpExpireTime = new Date(new Date().getTime() + 900000).toISOString();
  user.sentOTP = sentOTP;
  user.otpExpireTime = otpExpireTime;
  return await user.save();
};
userSchema.statics.removeOTP = async (user) => {
  user.sentOTP = undefined;
  user.otpExpireTime = undefined;
  user.isVerifiedOTP = true;
  return await user.save();
};

/**
 * Export Schema
 */
module.exports = mongoose.model('user', userSchema);
