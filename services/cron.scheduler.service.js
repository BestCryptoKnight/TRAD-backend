/*
 * Module Imports
 * */
const cron = require('node-cron');
let mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Task = mongoose.model('task');

/*
 * Local Imports
 * */
const Logger = require('./logger');
const config = require('./../config');
const { sendNotification } = require('./../helper/socket.helper');
const { addNotification } = require('./../helper/notification.helper');
const { removeUserToken } = require('./../helper/user.helper');
const { removeClientUserToken } = require('./../helper/client.helper');
const { checkForExpiringLimit } = require('./../helper/client-debtor.helper');
const {
  checkForExpiringReports,
  checkForReviewDebtor,
} = require('./../helper/debtor.helper');
const { retrieveAlertListFromIllion } = require('./../helper/alert.helper');

const scheduler = async () => {
  try {
    cron.schedule(
      '0 0 * * *',
      async () => {
        Logger.log.trace(
          'Updating application count according at 12 AM acc. to Australia/Sydney timezone ',
          new Date(),
        );
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const tasks = await Task.find({
          isCompleted: false,
          dueDate: { $gte: start, $lte: end },
          isDeleted: false,
        })
          .select('description assigneeId assigneeType dueDate')
          .lean();
        for (let i = 0; i < tasks.length; i++) {
          const notification = await addNotification({
            userId: tasks[i].assigneeId,
            userType: tasks[i].assigneeType,
            description: `${tasks[i].description} is due today`,
          });
          if (notification) {
            sendNotification({
              notificationObj: {
                type: 'DUE_TASK',
                data: notification,
              },
              type: notification.userType,
              userId: notification.userId,
            });
          }
        }
        await Organization.updateOne(
          { isDeleted: false },
          { 'entityCount.application': 0 },
        );
        await Promise.all([
          checkForReviewDebtor({ endDate: end }),
          checkForExpiringLimit({
            startDate: start,
            endDate: end,
          }),
          checkForExpiringReports({
            startDate: start,
            endDate: end,
          }),
        ]);
      },
      {
        scheduled: true,
        timezone: 'Australia/Sydney',
      },
    );

    /*
    Remove token from DB at 12 AM every sunday
     */
    cron.schedule(
      '0 0 * * 0',
      async () => {
        Logger.log.trace(
          'Remove token from database at 12 AM every sunday acc. to Australia/Sydney timezone',
          new Date(),
        );
        await Promise.all([removeUserToken(), removeClientUserToken()]);
      },
      {
        scheduled: true,
        timezone: 'Australia/Sydney',
      },
    );

    //TODO uncomment after to retrieve alert list
    /*
    Retrieve Alert List
     */
    /*cron.schedule(
      config.illion.cronString,
      async () => {
        Logger.log.trace(
          'Retrieve alert list at 1 AM acc. to Australia/Sydney timezone',
          new Date(),
        );
        let end = new Date();
        console.log(end);
        let start = new Date();
        start = new Date(start.setDate(start.getDate() - 1));
        start.setHours(0, 0, 0, 0);
        console.log('start', start);
        // start = start.setDate(start.getDate() - 1)
        console.log('end', end);
        // end.setHours(23, 59, 59, 999);
        /!*start = new Date(
          start.toString().split('GMT')[0] + ' UTC',
        ).toISOString();
        console.log(start);
        end = new Date(end.toString().split('GMT')[0] + ' UTC').toISOString();
        console.log(end);*!/
        await retrieveAlertListFromIllion({
          startDate: start,
          endDate: end,
        });
      },
      {
        scheduled: true,
        timezone: 'Australia/Sydney',
      },
    );*/
  } catch (e) {
    Logger.log.error('Error occurred in retrieve alert list', e.message || e);
  }
};

/**
 * Service Export
 */
module.exports = { scheduler };
