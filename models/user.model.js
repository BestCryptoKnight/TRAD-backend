/*
 * Module Imports
 * */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/*
 * Local Imports
 * */
const config = require('../config');
const Logger = require('../services/logger');

/**
 * Schema Definition
 */
const userSchema = new Schema(
  {
    name: Schema.Types.String,
    email: {
      type: Schema.Types.String,
      required: true,
    },
    isDeleted: { type: Schema.Types.Boolean, default: false },
    password: Schema.Types.String,
    signUpToken: Schema.Types.String,
    contactNumber: Schema.Types.String,
    verificationOtp: Schema.Types.Number,
    otpExpireTime: Schema.Types.Date,
    // profilePicture: Schema.Types.String,
    profileKeyPath: Schema.Types.String,
    jwtToken: [
      {
        token: Schema.Types.String,
        lastAPICallTime: { type: Schema.Types.Date },
        _id: false,
      },
    ],
    socketIds: [Schema.Types.String],
    role: {
      type: Schema.Types.String,
      enum: ['riskAnalyst', 'serviceManager', 'superAdmin'],
      default: 'superAdmin',
    },
    maxCreditLimit: Schema.Types.Number,
    moduleAccess: [
      {
        name: { type: Schema.Types.String },
        accessTypes: [
          { type: Schema.Types.String, enum: ['read', 'write', 'full-access'] },
        ],
        _id: false,
      },
    ],
    organizationId: { type: Schema.Types.ObjectId, ref: 'organization' },
    manageColumns: [
      {
        moduleName: { type: Schema.Types.String },
        columns: [{ type: Schema.Types.String }],
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

userSchema.statics.findByCredentials = async function (email, password) {
  try {
    let user = this;
    user = await user.findOne({
      email: { $regex: new RegExp('^' + email.toLowerCase() + '$', 'i') },
      isDeleted: false,
    });
    if (!user) {
      return Promise.reject({
        status: 'USER_NOT_FOUND',
        message: 'Incorrect email or password.',
      });
    }
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, user.password, (err, res) => {
        if (res === true) {
          return resolve(user);
        } else {
          Logger.log.warn('Wrong Password for email:', user.email);
          return reject({
            status: 'USER_NOT_FOUND',
            message: 'Incorrect email or password.',
          });
        }
      });
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in find user by credentials',
      e.message || e,
    );
    return Promise.reject(e);
  }
};

userSchema.statics.findByToken = async function (token) {
  let admin = this;
  let jwtSecret = config.jwt.secret;
  let d = new Date();
  let adminData;
  try {
    const decoded = jwt.verify(token, jwtSecret);
    adminData = await admin
      .findOne({
        _id: decoded._id,
        isDeleted: false,
      })
      .select({ password: 0 });
    const index = adminData.jwtToken.findIndex((i) => {
      return i.token === token;
    });
    if (index !== -1) {
      const expireTime = new Date(
        d.setHours(d.getHours() - config.jwt.expireTime),
      );
      const currentToken = adminData.jwtToken[index];
      if (expireTime < currentToken.lastAPICallTime) {
        await admin.updateOne(
          { _id: decoded._id, 'jwtToken.token': token },
          { $set: { 'jwtToken.$.lastAPICallTime': new Date() } },
        );
        return adminData;
      } else {
        adminData.jwtToken.splice(index, 1);
        await adminData.save();
        return Promise.reject({
          status: 'TOKEN_EXPIRED',
          message: 'JwtToken is expired',
        });
      }
    } else {
      return Promise.reject({
        status: 'TOKEN_NOT_FOUND',
        message: 'JwtToken is not found',
      });
    }
  } catch (e) {
    return Promise.reject({
      status: 'INVALID_TOKEN',
      message: 'Cannot decode token',
    });
  }
};

userSchema.methods.getAuthToken = function () {
  let a = this;
  let d = new Date();
  let jwtSecret = config.jwt.secret;
  let access = 'auth';
  return jwt
    .sign(
      {
        _id: a._id.toHexString(),
        // expiredTime: parseInt(config.jwt.expireTime) * 3600000 + d.getTime(),
        access,
      },
      jwtSecret,
    )
    .toString();
};

userSchema.pre('save', function (next) {
  var user = this;
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

userSchema.methods.comparePassword = function (password, encryptedPassword) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(password, encryptedPassword, function (err, isMatch) {
      if (err) {
        return reject(err);
      }
      return resolve(isMatch);
    });
  });
};

/*userSchema.methods.removeToken = function (token) {
  const user = this;
  return user.update({
    $pull: {
      jwtToken: token,
    },
  });
};*/

userSchema.statics.generateOtp = async (user) => {
  const verificationOtp = Math.floor(Math.random() * 899999 + 100000);
  const otpExpireTime = new Date(new Date().getTime() + 5 * 60 * 1000);
  user.verificationOtp = verificationOtp;
  user.otpExpireTime = otpExpireTime;
  return await user.save();
};

userSchema.statics.removeOtp = async (user) => {
  user.verificationOtp = null;
  user.otpExpireTime = null;
  return await user.save();
};

userSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('user', userSchema);
