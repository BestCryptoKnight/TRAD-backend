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
        password: Schema.Types.String,
        signUpToken: Schema.Types.String,
        contactNumber: Schema.Types.String,
        profilePicture: Schema.Types.String,
        role: {
            type: Schema.Types.String,
            enum: ['admin', 'user', 'superAdmin'],
            default: 'admin',
        },
        forgetToken: Schema.Types.String,
        organizationId: {type: Schema.Types.ObjectId, ref: 'organization'},
    },
    {timestamps: true},
);

userSchema.statics.findByCredentials = async function (email, password) {
    try {
        let user = this;
        user = await user.findOne({email});
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

userSchema.statics.findByToken = function (token) {
    let user = this;
    let decoded;
    let jwtSecret = config.jwtSecret;
    try {
        decoded = jwt.verify(token, jwtSecret);
    } catch (e) {
        return Promise.reject({status: 'INVALID_TOKEN', message: 'Cannot decode token'});
    }

    return user.findOne({
        _id: decoded._id,
    });
};

userSchema.methods.getAuthToken = function () {
    let u = this;
    let jwtSecret = config.jwtSecret;
    let access = 'auth';
    return jwt.sign({_id: u._id.toHexString(), access}, jwtSecret).toString();
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
