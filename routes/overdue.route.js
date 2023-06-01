/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Overdue = mongoose.model('overdue');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  getDrawerDetails,
  getLastOverdueList,
  getOverdueList,
  getMonthString,
  formatString,
  updateList,
} = require('./../helper/overdue.helper');
const { getCurrentDebtorList } = require('./../helper/debtor.helper');
const { addNotification } = require('./../helper/notification.helper');
const { getUserDetailsByClientId } = require('./../helper/client.helper');
const { sendNotification } = require('./../helper/socket.helper');

/**
 * Get Entity List
 */
router.get('/entity-list', async function (req, res) {
  try {
    const client = await Client.findById(req.user.clientId)
      .populate({
        path: 'insurerId',
        select: '_id name',
      })
      .select('insurerId')
      .lean();
    const insurer = [];
    if (client && client.insurerId && client.insurerId.name) {
      insurer.push(client.insurerId);
    }
    const response = await getCurrentDebtorList({
      userId: req.user.clientId,
      hasFullAccess: false,
      isForRisk: false,
      limit: req.query.limit,
      page: req.query.page,
      showCompleteList: false,
      isForOverdue: true,
    });
    const overdueTypes = [
      { _id: 'PAID', name: 'Paid' },
      { _id: 'INSOLVENCY', name: 'Insolvency' },
      { _id: 'REPAYMENT_PLAN', name: 'Repayment Plan' },
      { _id: 'WRITTEN_OFF', name: 'Written Off' },
      {
        _id: 'CLAIM_TO_BE_SUBMITTED_TO_TCR',
        name: 'Claim to be submitted to TCR',
      },
      {
        _id: 'QUERIED_INVOICES_TO_BE_RECONCILED',
        name: 'Queried Invoices to be Reconciled',
      },
      { _id: 'RETENTION', name: 'Retention' },
      { _id: 'PAYMENT_EXPECTED', name: 'Payment expected' },
      { _id: 'DISPUTE', name: 'Dispute' },
      { _id: 'LEGAL/COLLECTIONS', name: 'Legal/Collections' },
    ];
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        debtorId: response,
        overdueType: overdueTypes,
        insurerId: insurer,
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get overdue drop-down list',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Month & Year Overdue
 */
router.get('/list', async function (req, res) {
  if (!req.query.month || !req.query.year) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    // let month = new Date(req.query.date).getMonth() + 1;
    // let year = new Date(req.query.date).getFullYear();
    const query = {
      month: req.query.month.toString().padStart(2, '0'),
      year: req.query.year.toString(),
      clientId: req.user.clientId,
    };
    const overdue = await Overdue.find(query)
      .populate({
        path: 'debtorId insurerId',
        select: '_id entityName name',
      })
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    let client = await Client.findById(req.user.clientId)
      .select('_id name')
      .lean();
    client = client && client.name ? client.name : '';
    if (overdue && overdue.length !== 0) {
      /*  overdue.forEach((i) => {
        i.isExistingData = true;
        if (i.overdueAction !== 'MARK_AS_PAID') {
          delete i.overdueAction;
        }
        if (i.debtorId && i.debtorId.entityName) {
          i.debtorId = {
            label: i.debtorId.entityName,
            value: i.debtorId._id,
          };
        }
        if (i.insurerId && i.insurerId.name) {
          i.insurerId = {
            label: i.insurerId.name,
            value: i.insurerId._id,
          };
        }
        i.overdueType = {
          value: i.overdueType,
          label: formatString(i.overdueType),
        };
        i.status = {
          value: i.status,
          label: formatString(i.status),
        };
      });*/
      let isNilOverdue = false;
      for (let i = 0; i < overdue.length; i++) {
        if (overdue[i].nilOverdue) {
          isNilOverdue = true;
          break;
        } else {
          overdue[i].isExistingData = true;
          if (overdue[i].overdueAction !== 'MARK_AS_PAID') {
            delete overdue[i].overdueAction;
          }
          if (overdue[i].debtorId && overdue[i].debtorId.entityName) {
            overdue[i].debtorId = {
              label: overdue[i].debtorId.entityName,
              value: overdue[i].debtorId._id,
            };
          }
          if (overdue[i].insurerId && overdue[i].insurerId.name) {
            overdue[i].insurerId = {
              label: overdue[i].insurerId.name,
              value: overdue[i].insurerId._id,
            };
          }
          overdue[i].overdueType = {
            value: overdue[i].overdueType,
            label: formatString(overdue[i].overdueType),
          };
          overdue[i].status = {
            value: overdue[i].status,
            label: formatString(overdue[i].status),
          };
          overdue[i].index =
            req.user.clientId +
            (overdue[i]?.debtorId?._id ? overdue[i].debtorId._id : '') +
            (overdue[i]?.acn ? overdue[i].acn : '') +
            i;
        }
      }
      return res.status(200).send({
        status: 'SUCCESS',
        data: { docs: isNilOverdue ? [] : overdue, client, isNilOverdue },
      });
    } else {
      // query.overdueAction = { $ne: 'MARK_AS_PAID' };
      let { overdue, lastMonth, lastYear } = await getLastOverdueList({
        query,
        date: new Date(query?.year, query?.month, 1, 0, 0, 0),
      });
      const response = {
        docs: overdue,
        client,
        isNilOverdue: false,
      };
      if (overdue && overdue.length !== 0) {
        /*overdue.forEach((i) => {
          i.isExistingData = true;
          i.month = req.query.month;
          i.year = req.query.year;
          if (i.debtorId && i.debtorId.entityName) {
            i.debtorId = {
              label: i.debtorId.entityName,
              value: i.debtorId._id,
            };
          }
          if (i.insurerId && i.insurerId.name) {
            i.insurerId = {
              label: i.insurerId.name,
              value: i.insurerId._id,
            };
          }
          i.overdueType = {
            value: i.overdueType,
            label: formatString(i.overdueType),
          };
          i.status = {
            value: 'SUBMITTED',
            label: 'Submitted',
          };
        });*/
        const docs = [];
        for (let i = 0; i < overdue.length; i++) {
          if (overdue[i].nilOverdue) {
            response.isNilOverdue = true;
            break;
          } else {
            if (overdue[i].overdueAction !== 'MARK_AS_PAID') {
              overdue[i].isExistingData = true;
              overdue[i].month = req.query.month;
              overdue[i].year = req.query.year;
              if (overdue[i].debtorId && overdue[i].debtorId.entityName) {
                overdue[i].debtorId = {
                  label: overdue[i].debtorId.entityName,
                  value: overdue[i].debtorId._id,
                };
              }
              if (overdue[i].insurerId && overdue[i].insurerId.name) {
                overdue[i].insurerId = {
                  label: overdue[i].insurerId.name,
                  value: overdue[i].insurerId._id,
                };
              }
              overdue[i].overdueType = {
                value: overdue[i].overdueType,
                label: formatString(overdue[i].overdueType),
              };
              overdue[i].status = {
                value: 'SUBMITTED',
                label: 'Submitted',
              };
              delete overdue[i]._id;
              delete overdue[i].overdueAction;
              overdue[i].index =
                req.user.clientId +
                (overdue[i]?.debtorId?._id ? overdue[i].debtorId._id : '') +
                (overdue[i]?.acn ? overdue[i].acn : '') +
                i;
              docs.push(overdue[i]);
            }
          }
        }
        if (response.isNilOverdue) {
          response.docs = [];
          response.previousEntries = getMonthString(lastMonth) + ' ' + lastYear;
        } else {
          response.docs = docs;
          if (docs.length !== 0) {
            response.previousEntries =
              getMonthString(lastMonth) + ' ' + lastYear;
          }
        }
      }
      return res.status(200).send({
        status: 'SUCCESS',
        data: response,
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error occurred in get selected month and year list',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Overdue drawer details
 */
router.get('/details/:overdueId', async function (req, res) {
  if (
    !req.params.overdueId ||
    !mongoose.Types.ObjectId.isValid(req.params.overdueId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const overdue = await getDrawerDetails({
      overdueId: req.params.overdueId,
      isForRisk: false,
    });
    return res.status(200).send({
      status: 'SUCCESS',
      data: { response: overdue, header: 'Overdue Details' },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get drawer details', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get overdue list
 */
router.get('/', async function (req, res) {
  try {
    const { overdueList, headers, total } = await getOverdueList({
      requestedQuery: req.query,
      hasFullAccess: false,
      isForRisk: false,
      clientId: req.user.clientId,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: overdueList[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Specific Entity Overdue List
 */
router.get('/:entityId', async function (req, res) {
  if (
    !req.params.entityId ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId) ||
    !req.query.entityType
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const { overdueList, headers, total } = await getOverdueList({
      requestedQuery: req.query,
      isForRisk: true,
      clientId: req.user.clientId,
      entityId: req.params.entityId,
      isForSubmodule: true,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: overdueList[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while get specific overdue detail',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Save overdue list
 */
router.put('/list', async function (req, res) {
  if (
    !req.body.hasOwnProperty('nilOverdue') ||
    !req.body.hasOwnProperty('oldNilOverdue')
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    if (req.body.nilOverdue !== req.body.oldNilOverdue) {
      await Overdue.deleteMany({
        clientId: req.user.clientId,
        month: req.body.month,
        year: req.body.year,
      });
    }
    if (!req.body.nilOverdue) {
      if (!req.body.list || req.body.list.length === 0) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing.',
        });
      }
      const overdueArr = req.body.list.map((i) => {
        return (
          (i.debtorId ? i.debtorId : i.acn) +
          i.month.toString().padStart(2, '0') +
          i.year
        );
      });
      let isDuplicate = overdueArr.some((element, index) => {
        return overdueArr.indexOf(element) !== index;
      });
      if (isDuplicate) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'INVALID_DATA',
          message: 'Overdue list is invalid',
        });
      }
      await updateList({
        isForRisk: false,
        requestBody: req.body,
        clientId: req.user.clientId,
        userType: 'client-user',
        userId: req.user._id,
      });
    } else {
      if (req.body.list.length !== 0 || !req.body.month || !req.body.year) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing.',
        });
      }
      //TODO send notifications
      await Overdue.updateOne(
        {
          clientId: req.user.clientId,
          month: req.body.month,
          year: req.body.year,
        },
        {
          clientId: req.user.clientId,
          month: req.body.month,
          year: req.body.year,
          nilOverdue: req.body.nilOverdue,
          list: [],
          createdById: req.user._id,
          createdByType: 'client-user',
        },
        {
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
      const overdue = await Overdue.findOne({
        clientId: req.user.clientId,
        month: req.body.month,
        year: req.body.year,
      }).lean();
      const client = await getUserDetailsByClientId({
        clientId: req.user.clientId,
      });
      if (client?.riskAnalystId) {
        const overdueNotification = await addNotification({
          userId: client.riskAnalystId,
          userType: 'user',
          description: `A nil overdue is submitted by ${client?.name}`,
          entityType: 'overdue',
          entityId: overdue._id,
        });
        if (overdueNotification) {
          sendNotification({
            notificationObj: {
              type: 'OVERDUE_ADDED',
              data: overdueNotification,
            },
            type: 'user',
            userId: client.riskAnalystId,
          });
        }
      }
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Overdue list updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in save overdue list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update overdue status
 */
router.put('/status/:overdueId', async function (req, res) {
  if (
    !req.params.overdueId ||
    !mongoose.Types.ObjectId.isValid(req.params.overdueId) ||
    !req.body.status
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const query = {
      _id: req.params.overdueId,
    };
    if (req.body.status === 'PENDING') {
      query.status = 'SUBMITTED';
    }
    await Overdue.updateOne(query, { status: req.body.status });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Overdue status updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update status', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/*/!**
 * Update overdue
 *!/
router.put('/:overdueId', async function (req, res) {
  if (
    !req.params.overdueId ||
    !mongoose.Types.ObjectId.isValid(req.params.overdueId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    if (req.body.debtorId || req.body.month || req.body.year) {
      const query = {
        clientId: req.user.clientId,
      };
      if (req.body.debtorId) {
        query.debtorId = req.body.debtorId;
      }
      if (req.body.month && req.body.year) {
        query.month = req.body.month.toString().padStart(2, '0');
        query.year = req.body.year.toString();
      }
      const overdueDetail = await Overdue.findOne(query).lean();
      if (
        overdueDetail &&
        overdueDetail._id.toString() !== req.params.overdueId.toString()
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'OVERDUE_ALREADY_EXISTS',
          message: 'Overdue already exists, please create with another debtor',
        });
      }
    }
    const update = {};
    if (req.body.debtorId) update.debtorId = req.body.debtorId;
    if (req.body.acn) update.acn = req.body.acn;
    if (req.body.dateOfInvoice) update.dateOfInvoice = req.body.dateOfInvoice;
    if (req.body.overdueType) update.overdueType = req.body.overdueType;
    if (req.body.insurerId) update.insurerId = req.body.insurerId;
    if (req.body.month)
      update.month = req.body.month.toString().padStart(2, '0');
    if (req.body.currentAmount) update.currentAmount = req.body.currentAmount;
    if (req.body.thirtyDaysAmount)
      update.thirtyDaysAmount = req.body.thirtyDaysAmount;
    if (req.body.sixtyDaysAmount)
      update.sixtyDaysAmount = req.body.sixtyDaysAmount;
    if (req.body.ninetyDaysAmount)
      update.ninetyDaysAmount = req.body.ninetyDaysAmount;
    if (req.body.ninetyPlusDaysAmount)
      update.ninetyPlusDaysAmount = req.body.ninetyPlusDaysAmount;
    if (req.body.outstandingAmount)
      update.outstandingAmount = req.body.outstandingAmount;
    if (req.body.clientComment) update.clientComment = req.body.clientComment;
    await Overdue.updateOne({ _id: req.params.overdueId }, update);
    const overdue = await Overdue.findOne({ _id: req.params.overdueId })
      .populate({
        path: 'debtorId',
        select: '_id entityName',
      })
      .select(
        '_id debtorId overdueType overdueAction status month year outstandingAmount',
      )
      .lean();
    if (overdue) {
      overdue.isExistingData = true;
      if (overdue.debtorId && overdue.debtorId.entityName) {
        overdue.debtorId = overdue.debtorId.entityName;
      }
      overdue.overdueType = formatString(overdue.overdueType);
      overdue.status = formatString(overdue.status);
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Overdue status updated successfully',
      data: overdue,
    });
  } catch (e) {
    Logger.log.error('Error occurred in update overdue', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});
*/

/**
 * Export Router
 */
module.exports = router;
