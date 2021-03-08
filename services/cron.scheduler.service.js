/*
 * Module Imports
 * */
const cron = require('node-cron');
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./logger');

const scheduler = async () => {
  try {
    cron.schedule(
      '0 0 * * *',
      async () => {
        Logger.log.trace(
          'Updating application count according to Australia/Sydney timezone ',
          new Date(),
        );
        await Organization.updateOne(
          { isDeleted: false },
          { 'entityCount.application': 0 },
        );
      },
      {
        scheduled: true,
        timezone: 'Australia/Sydney',
      },
    );
  } catch (e) {
    Logger.log.error('Error occurred in scheduling cron ', e.message || e);
  }
};

/**
 * Service Export
 */
module.exports = { scheduler };
