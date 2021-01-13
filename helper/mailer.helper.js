/*
* Module Imports
* */
const nodemailer = require('nodemailer');

/*
* Local Imports
* */
const config = require('../config');
const Logger = require('./../services/logger');
const forgotPasswordAdminTemplate = require('./../static-files/forgotPassword.risk.template');
const newAdminTemplate = require('./../static-files/newUser.risk.template');
const newClientTemplate = require('./../static-files/newUser.client.template');

const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
        user: 'apikey',
        pass: config.mailer.sendgridApiKey,
    },
});

const sendMail = ({toAddress, subject, text, html, mailFor}) => {
    return new Promise((resolve, reject) => {
        let toAddressStr = '';
        toAddress.forEach((toAddr) => {
            toAddressStr += toAddr + ', ';
        });
        toAddressStr.substr(0, toAddressStr.lastIndexOf(','));
        switch (mailFor) {
            case 'newAdminUser':
                html = newAdminTemplate({name: text.name, setPasswordLink: text.setPasswordLink});
                break;
            case 'adminForgotPassword':
                html = forgotPasswordAdminTemplate({
                    name: text.name,
                    resetPasswordLink: text.resetPasswordLink,
                    forgotPasswordLink: text.forgotPasswordLink,
                });
                break;
            case 'newClientUser':
                html = newClientTemplate({name: text.name, setPasswordLink: text.setPasswordLink});
                break;
            case 'clientForgotPassword':
                // html = forgotPasswordTemplate({
                //     name: text.name,
                //     resetPasswordLink: text.resetPasswordLink,
                //     forgotPasswordLink: text.forgotPasswordLink,
                // });
                break;
            case 'profileUpdate':
                // html = profileUpdateTemplate({
                //     name: text.name,
                //     updateFields: text.updateFields,
                //     updatedBy: text.updatedBy,
                // });
                break;
        }
        const mailBody = {
            from: config.mailer.fromAddress,
            to: toAddressStr,
            subject: subject,
        };
        if (html) {
            mailBody.html = html;
        } else {
            mailBody.text = text;
        }
        if (config.mailer.send === 'true') {
            transporter.sendMail(mailBody, (err, info) => {
                if (err) {
                    Logger.log.error('Error sending mail:', err.message || err);
                    reject(err);
                } else {
                    Logger.log.info('Mail sent Successfully:', info);
                    resolve(info);
                }
            });
        } else {
            resolve({
                message: 'SkippedSendMail',
                description:
                    'The Mailer did not send mail because of the process configs, set "SEND_MAIL"=true in environment to enable mail service',
                mailObject: mailBody,
            });
        }
    });
};

/**
 * Export Router
 */
module.exports = {
    sendMail,
};
