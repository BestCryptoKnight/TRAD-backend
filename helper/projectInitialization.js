/*
* Module Imports
* */
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Organization = mongoose.model('organization');

/*
* Local Imports
* */
const config = require('../config');
const MailHelper = require('./../helper/mailer.helper');
const Logger = require('../services/logger');

let createSuperAdmin = () => {
    return new Promise(async (resolve, reject) => {
        try {
            let superAdmin = await User.findOne({email: config.superAdmin.email});
            if (superAdmin) {
                Logger.log.info('Super admin already exists.');
                return resolve();
            }
            let user = new User({
                role: 'superAdmin',
                name: 'Super Admin User',
                email: config.superAdmin.email,
                password: config.superAdmin.password,
                profilePicture: null,
            });
            let organization = new Organization({
                name: config.organization.name
            });
            await organization.save();
            let signUpToken = jwt.sign(JSON.stringify({_id: user._id}), config.jwt.secret);
            user.signUpToken = signUpToken;
            user.organizationId = organization._id;
            await user.save();
            let mailObj = {
                toAddress: [user.email],
                subject: 'Welcome to TRAD',
                text: {
                    name: user.name ? user.name : '',
                    setPasswordLink:
                        config.server.frontendUrls.adminPanelBase +
                        config.server.frontendUrls.setPasswordPage +
                        user._id +
                        '?token=' +
                        signUpToken,
                },
                mailFor: 'newUser',
            };
            await MailHelper.sendMail(mailObj);
            Logger.log.info('SuperAdmin created successfully.');
            return resolve();
        } catch (e) {
            Logger.log.error('Error occurred.', e.message || e);
            return reject(e);
        }

    });
};

module.exports = {
    createSuperAdmin,
};
