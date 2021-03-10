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
const clientUserSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'client' },
    name: Schema.Types.String,
    contactNumber: { type: Schema.Types.String },
    department: { type: Schema.Types.String },
    hasPortalAccess: { type: Schema.Types.Boolean, default: false },
    hasLeftCompany: { type: Schema.Types.Boolean },
    isDecisionMaker: { type: Schema.Types.Boolean },
    crmContactId: { type: Schema.Types.String },
    email: {
      type: Schema.Types.String,
      unique: true,
    },
    password: Schema.Types.String,
    signUpToken: Schema.Types.String,
    profilePicture: Schema.Types.String,
    jwtToken: [Schema.Types.String],
    isDeleted: { type: Schema.Types.Boolean, default: false },
    manageColumns: [
      {
        moduleName: { type: Schema.Types.String },
        columns: [{ type: Schema.Types.String }],
      },
    ],
    verificationOtp: Schema.Types.Number,
    otpExpireTime: Schema.Types.Date,
  },
  { timestamps: true },
);

clientUserSchema.statics.findByCredentials = async function (email, password) {
  try {
    let clientUser = this;
    clientUser = await clientUser.findOne({
      email,
      isDeleted: false,
      hasPortalAccess: true,
    });
    if (!clientUser) {
      return Promise.reject({
        status: 'USER_NOT_FOUND',
        message: 'Incorrect email or password.',
      });
    }
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, clientUser.password, (err, res) => {
        if (res === true) {
          return resolve(clientUser);
        } else {
          Logger.log.warn('Wrong Password for email:', clientUser.email);
          return reject({
            status: 'ERROR',
            message: 'Incorrect email or password.',
          });
        }
      });
    });
  } catch (e) {
    Logger.log.error('Error occurred.', e.message || e);
    return Promise.reject(e);
  }
};

clientUserSchema.statics.findByToken = async function (token) {
  const clientUser = this;
  const jwtSecret = config.jwt.secret;
  // let decoded;
  const d = new Date();
  let clientUserData;
  try {
    const decoded = jwt.verify(token, jwtSecret);
    console.log(decoded);
    clientUserData = await clientUser.findOne({ _id: decoded._id });
    if (clientUserData.jwtToken.indexOf(token) !== -1) {
      if (decoded.expiredTime > d.getTime()) {
        return clientUserData;
      } else {
        clientUserData.jwtToken.splice(
          clientUserData.jwtToken.indexOf(token),
          1,
        );
        await clientUserData.save();
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

clientUserSchema.methods.getAuthToken = function () {
  let a = this;
  let d = new Date();
  let jwtSecret = config.jwt.secret;
  const access = 'auth';
  return jwt
    .sign(
      {
        _id: a._id.toHexString(),
        expiredTime: parseInt(config.jwt.expireTime) * 3600000 + d.getTime(),
        access,
      },
      jwtSecret,
    )
    .toString();
};

clientUserSchema.pre('save', function (next) {
  const user = this;
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

clientUserSchema.methods.comparePassword = function (
  oldPassword,
  encryptedPassword,
) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(oldPassword, encryptedPassword, function (err, isMatch) {
      if (err) {
        console.log('err:: ', err);
        return reject(err);
      }
      return resolve(isMatch);
    });
  });
};

clientUserSchema.methods.removeToken = function (token) {
  const clientUser = this;
  return clientUser.update({
    $pull: {
      jwtToken: token,
    },
  });
};

clientUserSchema.statics.generateOtp = async (user) => {
  const verificationOtp = Math.floor(Math.random() * 899999 + 100000);
  const otpExpireTime = new Date(new Date().getTime() + 5 * 60 * 1000);
  user.verificationOtp = verificationOtp;
  user.otpExpireTime = otpExpireTime;
  return await user.save();
};
clientUserSchema.statics.removeOtp = async (user) => {
  user.verificationOtp = null;
  user.otpExpireTime = null;
  return await user.save();
};

clientUserSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('client-user', clientUserSchema);
