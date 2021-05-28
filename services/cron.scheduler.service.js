/*
 * Module Imports
 * */
const cron = require('node-cron');
let mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./logger');
const { sendNotification } = require('./../helper/socket.helper');

const scheduler = async () => {
  try {
    cron.schedule(
      '0 0 * * *',
      async () => {
        Logger.log.trace(
          'Updating application count according at 12 AM acc. to Australia/Sydney timezone ',
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

    /*
    Review Debtor
     */
    cron.schedule(
      '0 0 * * *',
      async () => {
        Logger.log.trace(
          'Check for review debtor at 12 AM acc. to Australia/Sydney timezone ',
          new Date(),
        );
        const debtors = await Debtor.find({
          reviewDate: { $lte: new Date(), isActive: true },
        }).lean();
        for (let i = 0; i < debtors.length; i++) {
          //TODO send notification
        }
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
