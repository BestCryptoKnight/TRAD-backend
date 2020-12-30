/*
* Module Imports
* */
const nodemailer = require('nodemailer');

/*
* Local Imports
* */
const config = require('../config');
const Logger = require('./../services/logger');

const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
        user: 'apikey',
        pass: config.mailer.sendgridApiKey,
    },
});

const sendMail = ({ toAddress, subject, text, html, mailFor }) => {
    return new Promise((resolve, reject) => {
        let toAddressStr = '';
        toAddress.forEach((toAddr) => {
            toAddressStr += toAddr + ', ';
        });
        toAddressStr.substr(0, toAddressStr.lastIndexOf(','));
        const mailBody = {
            from: config.mailer.fromAddress,
            to: toAddressStr,
            subject: subject,
            text: JSON.stringify(text, null, 2),
            //html: html <-- Can assign the HTML template here
        };
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
