/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Notification = mongoose.model('notification');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const addNotification = async ({ userType, userId, description }) => {
  try {
    await Notification.create({ userType, userId, description });
    Logger.log.info('Notification added');
  } catch (e) {
    Logger.log.error(`Error occurred in add notification `, e.message || e);
  }
};

module.exports = { addNotification };
