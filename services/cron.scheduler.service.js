/*
 * Module Imports
 * */
const cron = require('node-cron');
let mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Task = mongoose.model('task');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');
const Policy = mongoose.model('policy');

/*
 * Local Imports
 * */
const Logger = require('./logger');
const config = require('./../config');
const RssHelper = require('./../helper/rss.helper');
const { getClientPolicies } = require('./../helper/rss.helper');
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
          'Updating application count according at 12 AM acc. to Australia/Melbourne timezone ',
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
            description: `${tasks[i]?.description} is due today`,
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
        timezone: config.organization.timeZone,
      },
    );

    /*
    Remove token from DB at 12 AM every sunday
     */
    cron.schedule(
      '0 0 * * 0',
      async () => {
        Logger.log.trace(
          'Remove token from database at 12 AM every sunday acc. to Australia/Melbourne timezone',
          new Date(),
        );
        await Promise.all([removeUserToken(), removeClientUserToken()]);
      },
      {
        scheduled: true,
        timezone: config.organization.timeZone,
      },
    );

    /*
    Sync Clients everyday at 2AM Australia Sydney time
     */

    cron.schedule(
      '0 2 * * *',
      async () => {
        let clients = await Client.find({}).lean();
        let delay = 10000;
        const wait = async (seconds) => {
          await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        };
        for (let i = 0; i < clients.length; i++) {
          /**
           * Sync client contacts
           */
          try {
            const clientUsers = await ClientUser.find({
              isDeleted: false,
              clientId: clients[i]._id,
            })
              .select('crmContactId')
              .lean();
            const oldUsers = clientUsers.map((i) => i.crmContactId.toString());
            //const newUsers = [];
            let contactsFromCrm = await RssHelper.getClientContacts({
              clientId: clients[i].crmClientId,
            });
            contactsFromCrm.forEach((i) => {
              if (oldUsers.includes(i.crmContactId.toString())) {
                oldUsers.splice(oldUsers.indexOf(i.crmContactId.toString()), 1);
              }
            });
            let promiseArr = [];
            let query = {};
            for (let k = 0; k < contactsFromCrm.length; k++) {
              query = {
                isDeleted: false,
                crmContactId: contactsFromCrm[k].crmContactId,
              };
              const clientUser = await ClientUser.findOne(query).lean();
              contactsFromCrm[k].clientId = clients[i]._id;
              if (
                !clientUser ||
                !clientUser.hasOwnProperty('hasPortalAccess')
              ) {
                contactsFromCrm[k].hasPortalAccess = false;
              }
              if (
                !clientUser ||
                !clientUser.hasOwnProperty('sendDecisionLetter')
              ) {
                contactsFromCrm[k].sendDecisionLetter = false;
              }
              query =
                clientUser && clientUser._id
                  ? {
                      _id: clientUser._id,
                    }
                  : {
                      crmContactId: contactsFromCrm[k].crmContactId,
                      isDeleted: false,
                    };
              promiseArr.push(
                ClientUser.updateOne(query, contactsFromCrm[k], {
                  upsert: true,
                }),
              );
              // if (clientUser && clientUser._id) {
              //   promiseArr.push(
              //     addAuditLog({
              //       entityType: 'client-user',
              //       entityRefId: clientUser._id,
              //       userType: 'user',
              //       userRefId: req.user._id,
              //       actionType: 'sync',
              //       logDescription: `Client contact ${contactsFromCrm[k].name} synced by ${req.user.name}`,
              //     }),
              //   );
              // }
            }
            if (oldUsers?.length !== 0) {
              promiseArr.push(
                ClientUser.updateMany(
                  { crmContactId: { $in: oldUsers } },
                  {
                    isDeleted: true,
                    sendDecisionLetter: false,
                    hasPortalAccess: false,
                  },
                ),
              );
            }
            await Promise.all(promiseArr);

            //to sync client details

            const clientDataFromCrm = await RssHelper.getClientById({
              clientId: clients[i].crmClientId,
            });
            const insurer = await RssHelper.fetchInsurerDetails({
              underwriterName: clientDataFromCrm.underWriter,
              crmClientId: clientDataFromCrm.crmClientId,
              clientId: clients[i]._id,
              // auditLog: { userType: 'user', userRefId: req.user._id },
            });
            clientDataFromCrm.insurerId =
              insurer && insurer._id ? insurer._id : null;
            await Client.updateOne({ _id: clients[i]._id }, clientDataFromCrm);
            // await addAuditLog({
            //   entityType: 'client',
            //   entityRefId: req.params.clientId,
            //   userType: 'user',
            //   userRefId: req.user._id,
            //   actionType: 'sync',
            //   logDescription: `Client ${clientDataFromCrm.name} synced by ${req.user.name}`,
            // });

            // sync client policies

            let promiseArray = [];
            let newPolicies = [];
            if (clients[i] && clients[i]._id && clients[i].insurerId) {
              const policiesFromCrm = await getClientPolicies({
                clientId: clients[i]._id,
                crmClientId: clients[i].crmClientId,
                insurerId: clients[i].insurerId,
              });
              for (let j = 0; j < policiesFromCrm.length; j++) {
                promiseArray.push(
                  Policy.updateOne(
                    {
                      crmPolicyId: policiesFromCrm[j].crmPolicyId,
                      isDeleted: false,
                    },
                    policiesFromCrm[j],
                    { upsert: true, setDefaultsOnInsert: true },
                  ),
                );
                const policy = await Policy.findOne({
                  crmPolicyId: policiesFromCrm[j].crmPolicyId,
                  isDeleted: false,
                }).lean();
                if (policy && policy._id) {
                  // promiseArray.push(
                  //   addAuditLog({
                  //     entityType: 'policy',
                  //     entityRefId: policy._id,
                  //     userType: 'user',
                  //     userRefId: req.user._id,
                  //     actionType: 'sync',
                  //     logDescription: `Client ${client.name} policy no. ${policiesFromCrm[j].policyNumber} synced by ${req.user.name}`,
                  //   }),
                  // );
                } else {
                  newPolicies.push(policiesFromCrm[j].crmPolicyId);
                }
              }
              await Promise.all(promiseArray);
            }
            // let promises = [];
            // if (newPolicies.length !== 0) {
            //   const policyData = await Policy.find({
            //     crmPolicyId: { $in: newPolicies },
            //   }).lean();
            // for (let i = 0; i < policyData.length; i++) {
            //   promises.push(
            //     addAuditLog({
            //       entityType: 'policy',
            //       entityRefId: policyData[i]._id,
            //       userType: 'user',
            //       userRefId: req.user._id,
            //       actionType: 'sync',
            //       logDescription: `Client ${client.name} policy no. ${policyData[i].policyNumber} synced by ${req.user.name}`,
            //     }),
            //   );
            // }
            // }
          } catch (e) {
            Logger.log.error(
              'Error occurred in Sync Client Data Cron Scheduler',
              e.message || e,
            );
          }
          await wait(2);
        }
        Logger.log.info('User Details Synced Successfully.');
      },
      {
        scheduled: true,
        timezone: config.organization.timeZone,
      },
    );

    /*
    Retrieve Alert List
     */
    cron.schedule(
      config.illion.cronString,
      async () => {
        Logger.log.trace(
          'Retrieve alert list at 1 AM acc. to Australia/Melbourne timezone',
          new Date(),
        );
        let end = new Date();
        let start = new Date();
        start = new Date(start.setDate(start.getDate() - 1));
        start.setHours(0, 0, 0, 0);
        Logger.log.info('Alert start time..', start);
        Logger.log.info('Alert end time..', end);
        // start = start.setDate(start.getDate() - 1)
        // end.setHours(23, 59, 59, 999);
        /*start = new Date(
          start.toString().split('GMT')[0] + ' UTC',
        ).toISOString();
        console.log(start);
        end = new Date(end.toString().split('GMT')[0] + ' UTC').toISOString();
        console.log(end);*/
        await retrieveAlertListFromIllion({
          startDate: start,
          endDate: end,
        });
      },
      {
        scheduled: true,
        timezone: config.organization.timeZone,
      },
    );
  } catch (e) {
    Logger.log.error('Error occurred in Cron Scheduler', e.message || e);
  }
};

/**
 * Service Export
 */
module.exports = { scheduler };
