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
const forgotPasswordClientTemplate = require('../static-files/forgotPassword.client.template.js');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: config.mailer.sendgridApiKey,
  },
});
const sendMail = ({ toAddress, subject, text, html, mailFor, attachments }) => {
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
    };
    switch (mailFor) {
      case 'newAdminUser':
        mailBody.html = newAdminTemplate({
          name: text.name,
          setPasswordLink: text.setPasswordLink,
          address: text.address,
          email: text.email,
          contactNumber: text.contactNumber,
        });
        break;
      case 'adminForgotPassword':
        mailBody.html = forgotPasswordAdminTemplate({
          name: text.name,
          otp: text.otp,
          expireTime: text.expireTime,
          address: text.address,
          email: text.email,
          contactNumber: text.contactNumber,
        });
        break;
      case 'newClientUser':
        mailBody.html = newClientTemplate({
          name: text.name,
          setPasswordLink: text.setPasswordLink,
          riskAnalystName: text.riskAnalystName,
          riskAnalystNumber: text.riskAnalystNumber,
          riskAnalystEmail: text.riskAnalystEmail,
          serviceManagerName: text.serviceManagerName,
          serviceManagerNumber: text.serviceManagerNumber,
          serviceManagerEmail: text.serviceManagerEmail,
        });
        break;
      case 'clientForgotPassword':
        // html = forgotPasswordTemplate({
        //     name: text.name,
        //     resetPasswordLink: text.resetPasswordLink,
        //     forgotPasswordLink: text.forgotPasswordLink,
        // });
        mailBody.html = forgotPasswordClientTemplate({
          name: text.name,
          otp: text.otp,
          expireTime: text.expireTime,
          riskAnalystName: text.riskAnalystName,
          riskAnalystNumber: text.riskAnalystNumber,
          riskAnalystEmail: text.riskAnalystEmail,
          serviceManagerName: text.serviceManagerName,
          serviceManagerNumber: text.serviceManagerNumber,
          serviceManagerEmail: text.serviceManagerEmail,
        });
        break;
      case 'profileUpdate':
        // html = profileUpdateTemplate({
        //     name: text.name,
        //     updateFields: text.updateFields,
        //     updatedBy: text.updatedBy,
        // });
        break;
      case 'decisionLetter':
        mailBody.attachments = attachments;
        break;
    }
    /*if (html) {
      mailBody.html = html;
    } else {
      mailBody.text = 'Name : ' + text.name + '\nOTP : ' + text.otp;
    }*/
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
