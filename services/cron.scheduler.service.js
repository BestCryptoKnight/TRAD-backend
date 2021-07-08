/*
 * Module Imports
 * */
const cron = require('node-cron');
let mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Debtor = mongoose.model('debtor');
const ClientDebtor = mongoose.model('client-debtor');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const Logger = require('./logger');
const { sendNotification } = require('./../helper/socket.helper');
const { addNotification } = require('./../helper/notification.helper');

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
          reviewDate: { $lte: new Date() },
          // isActive: true,
        }).lean();
        const debtorIds = debtors.map((i) => i._id);
        const clientDebtors = await ClientDebtor.find({
          debtorId: { $in: debtorIds },
        })
          .populate({
            path: 'clientId',
            populate: { path: 'riskAnalystId serviceManagerId' },
          })
          .populate('debtorId')
          .lean();
        const response = [];
        clientDebtors.forEach((i) => {
          if (
            i.clientId &&
            i.clientId.riskAnalystId &&
            i.clientId.riskAnalystId._id &&
            i.debtorId &&
            i.debtorId._id &&
            i.debtorId.entityName
          ) {
            response.push({
              id: i.debtorId._id + i.clientId.riskAnalystId._id,
              debtorId: i.debtorId._id,
              debtorName: i.debtorId.entityName,
              riskAnalystId: i.clientId.riskAnalystId._id,
            });
          }
        });
        const filteredData = Array.from(new Set(response.map((s) => s.id))).map(
          (id) => {
            return {
              id: id,
              debtorId: response.find((i) => i.id === id).debtorId,
              debtorName: response.find((i) => i.id === id).debtorName,
              riskAnalystId: response.find((i) => i.id === id).riskAnalystId,
            };
          },
        );
        console.log(filteredData, 'filteredData');
        for (let i = 0; i < filteredData.length; i++) {
          //TODO send notification
          const notification = await addNotification({
            userId: filteredData[i].riskAnalystId,
            userType: 'user',
            description: `Review Debtor ${filteredData[i].debtorName}`,
          });
          if (notification) {
            sendNotification({
              notificationObj: {
                type: 'REVIEW_DEBTOR',
                data: notification,
              },
              type: notification.userType,
              userId: notification.userId,
            });
          }
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
