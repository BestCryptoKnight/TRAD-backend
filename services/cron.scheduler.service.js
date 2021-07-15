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
const { sendNotification } = require('./../helper/socket.helper');
const { addNotification } = require('./../helper/notification.helper');
const { removeUserToken } = require('./../helper/user.helper');
const { removeClientUserToken } = require('./../helper/client.helper');
const { checkForExpiringLimit } = require('./../helper/client-debtor.helper');
const {
  checkForExpiringReports,
  checkForReviewDebtor,
} = require('./../helper/debtor.helper');

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
          .select('title assigneeId assigneeType dueDate')
          .lean();
        for (let i = 0; i < tasks.length; i++) {
          const notification = await addNotification({
            userId: tasks[i].assigneeId,
            userType: tasks[i].assigneeType,
            description: `${tasks[i].title} is due today`,
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
  } catch (e) {
    Logger.log.error('Error occurred in scheduling cron ', e.message || e);
  }
};

/**
 * Service Export
 */
module.exports = { scheduler };
