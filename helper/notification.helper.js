/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Notification = mongoose.model('notification');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const addNotification = async ({
  userType,
  userId,
  description,
  entityId,
  entityType,
}) => {
  try {
    const notification = await Notification.create({
      userType,
      userId,
      description,
      entityType,
      entityId,
    });
    Logger.log.info('Notification added');
    return notification;
  } catch (e) {
    Logger.log.error(`Error occurred in add notification `, e.message || e);
  }
};

const getNotificationList = async ({ query }) => {
  try {
    const notificationList = await Notification.aggregate(query).allowDiskUse(
      true,
    );
    const notifications =
      notificationList?.[0]?.['paginatedResult'] || notificationList;

    const total = notificationList?.[0]?.['totalCount']?.[0]?.['count'] || 0;
    notifications.forEach((notification) => {
      notification.hasSubModule = false;
      switch (notification?.entityType) {
        case 'credit-limit':
        case 'credit-report':
          notification.hasSubModule = true;
          notification.subModule = notification.entityType;
          notification.entityType = 'debtor';
          break;
      }
    });
    return { notifications, total };
  } catch (e) {
    Logger.log.error('Error occurred in get notification list');
    Logger.log.error(e);
  }
};

module.exports = { addNotification, getNotificationList };
