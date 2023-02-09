/*
 * Module Imports
 * */
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const config = require('../config');
const Logger = require('./../services/logger');
const forgotPasswordAdminTemplate = require('./../static-files/forgotPassword.risk.template');
const newAdminTemplate = require('./../static-files/newUser.risk.template');
const claimCreatedTemplate = require('./../static-files/claimCreated.client.template');
const newClientTemplate = require('./../static-files/newUser.client.template');
const forgotPasswordClientTemplate = require('../static-files/forgotPassword.client.template.js');
const decisionLetterClientTemplate = require('../static-files/decisionLetter.client.template');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: config.mailer.sendgridApiKey,
  },
});
const sendMail = ({ toAddress, subject, text, html, mailFor, attachments }) => {
  return new Promise(async (resolve, reject) => {
    let toAddressStr = '';
    toAddress.forEach((toAddr) => {
      toAddressStr += toAddr + ', ';
    });
    toAddressStr.substr(0, toAddressStr.lastIndexOf(','));
    const organization = await Organization.findOne().lean();
    const mailBody = {
      from: config.mailer.fromAddress,
      replyTo: config.mailer.replyTo,
      to: toAddressStr,
      subject: subject,
    };
    switch (mailFor) {
      case 'claimCreated':
        mailBody.html = claimCreatedTemplate({
          clientName: text.name,
          nameOfServiceManagerOrRiskAnalyst:
            text.nameOfServiceManagerOrRiskAnalyst,
          claimLink: text.claimLink,
          claimName: text.claimName,
        });
        break;
      case 'newAdminUser':
        mailBody.html = newAdminTemplate({
          name: text.name,
          setPasswordLink: text.setPasswordLink,
          address: organization?.address || '-',
          email: organization?.email || '-',
          contactNumber: organization?.contactNumber || '-',
        });
        break;
      case 'adminForgotPassword':
        mailBody.html = forgotPasswordAdminTemplate({
          name: text.name,
          otp: text.otp,
          expireTime: text.expireTime,
          address: organization?.address || '-',
          email: organization?.email || '-',
          contactNumber: organization?.contactNumber || '-',
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
          address: organization?.address || '-',
          email: organization?.email || '-',
          contactNumber: organization?.contactNumber || '-',
        });
        break;
      case 'clientForgotPassword':
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
          address: organization?.address || '-',
          email: organization?.email || '-',
          contactNumber: organization?.contactNumber || '-',
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
        mailBody.html = decisionLetterClientTemplate({
          address: organization?.address || '-',
          email: organization?.email || '-',
          contactNumber: organization?.contactNumber || '-',
          debtorName: text.debtorName,
          website: organization?.website || '-',
        });
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
