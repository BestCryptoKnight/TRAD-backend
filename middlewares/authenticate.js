/*
* Module Imports
* */
const mongoose = require('mongoose');
const User = mongoose.model('user');

/*
* Local Imports
* */
const Logger = require('../services/logger');

let authMiddleWare = async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).send();
    }
    let token = req.header('authorization');
    if (token) {
        try {
            let user = await User.findByToken(token)
            if (user) {
                req.user = user;
                req.token = token;
                Logger.log.info('AUTH - user id:' + user._id);
                next();
            } else {
                res.status(401).send('Auth-Token is not valid');
            }
        } catch (e) {
            Logger.log.error('Error occurred.', e.message || e);
            return reject(e);
        }
    } else {
        Logger.log.warn('JWT - Auth-Token not set in header');
        res.status(401).unauthorized('Auth-Token not set in header');
    }
};

let superAdminMiddleWare = (req, res, next) => {
    if (req.user) {
        if (req.user.role === 'superAdmin') {
            next();
        } else {
            Logger.log.warn(`User is ${req.user.role} and trying to access SuperAdmin routes`);
            res.status(401).send('You are unauthorized to access this page.');
        }
    } else {
        Logger.log.warn('User not found, please login again.');
        res.status(400).send('User not found, please login again.');
    }
};

let adminMiddleWare = (req, res, next) => {
    if (req.user) {
        if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
            next();
        } else {
            Logger.log.warn(`User is ${req.user.role} and trying to access Admin routes`);
            res.status(401).send('You are unauthorized to access this page.');
        }
    } else {
        Logger.log.warn('User not found, please login again.');
        res.status(400).send('User not found, please login again.');
    }
};

module.exports = {
    authMiddleWare,
    adminMiddleWare,
    superAdminMiddleWare,
};
