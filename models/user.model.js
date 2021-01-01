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
const userSchema = new Schema({
        name: Schema.Types.String,
        email: {
            type: Schema.Types.String,
            required: true,
            unique: true
        },
        isDeleted: { type: Schema.Types.Boolean, default: false },
        password: Schema.Types.String,
        signUpToken: Schema.Types.String,
        contactNumber: Schema.Types.String,
        profilePicture: Schema.Types.String,
        jwtToken: [Schema.Types.String],
        role: {
            type: Schema.Types.String,
            enum: ['admin', 'user', 'superAdmin'],
            default: 'admin',
        },
        moduleAccess: [{
            name: {type: Schema.Types.String},
            accessTypes: [{type: Schema.Types.String, enum: ['read', 'write', 'full-access']}]
        }],
        organizationId: {type: Schema.Types.ObjectId, ref: 'organization'},
    },
    {timestamps: true},
);

userSchema.statics.findByCredentials = async function (email, password) {
    try {
        let user = this;
        user = await user.findOne({email, isDeleted: false});
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
        Logger.log.error('Error occurred.', e.message || e);
        return Promise.reject(e);
    }
};

userSchema.statics.findByToken = async function (token) {
    let admin = this;
    let decoded;
    let jwtSecret = config.jwt.secret;
    let d = new Date();
    let adminData;
    try {
        decoded = jwt.verify(token, jwtSecret);
        console.log(decoded);
        adminData = await admin
            .findOne({
                _id: decoded._id,
            })
            .select({'password': 0});
        if (adminData.jwtToken.indexOf(token) !== -1) {
            if (decoded.expiredTime > d.getTime()) {
                return adminData;
            } else {
                adminData.jwtToken.splice(adminData.jwtToken.indexOf(token), 1);
                await adminData.save();
                return Promise.reject({ status: 'TOKEN_EXPIRED', message: 'JwtToken is expired' });
            }
        } else {
            return Promise.reject({ status: 'TOKEN_NOT_FOUND', message: 'JwtToken is not found' });
        }
    } catch (e) {
        return Promise.reject({ status: 'INVALID_TOKEN', message: 'Cannot decode token' });
    }
};

userSchema.methods.getAuthToken = function () {
    let a = this;
    let d = new Date();
    let jwtSecret = config.jwt.secret;
    let access = 'auth';
    return jwt
        .sign(
            { _id: a._id.toHexString(), expiredTime: parseInt(config.jwt.expireTime) * 3600000 + d.getTime(), access },
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

userSchema.methods.comparePassword = function (oldPassword) {
    return new Promise((resolve, reject) => {
        bcrypt.compare(oldPassword, this.password, function (err, isMatch) {
            if (err) {
                return cb(err);
            }
            return resolve(isMatch);
        });
    });
};

userSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('user', userSchema);
