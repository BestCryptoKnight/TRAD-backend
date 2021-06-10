/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Overdue = mongoose.model('overdue');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  getDrawerDetails,
  getLastOverdueList,
  getOverdueList,
  getDebtorList,
  getMonthString,
  formatString,
} = require('./../helper/overdue.helper');

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
    const debtors = await getDebtorList({
      isForRisk: false,
      userId: req.user.clientId,
      hasFullAccess: false,
    });
    const overdueTypes = [
      { _id: 'PAID', name: 'Paid' },
      { _id: 'INSOLVENCY', name: 'Insolvency' },
      { _id: 'REPAYMENT_PLAN', name: 'Repayment Plan' },
      { _id: 'RETURNED_CHEQUE', name: 'Returned Cheque' },
      { _id: 'RETENTION', name: 'Retention' },
      { _id: 'PAYMENT_EXPECTED', name: 'Payment expected' },
      { _id: 'DISPUTE', name: 'Dispute' },
      { _id: 'LEGAL/COLLECTIONS', name: 'Legal/Collections' },
    ];
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        debtorId: debtors,
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
  if (!req.query.date) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let month = new Date(req.query.date).getMonth() + 1;
    let year = new Date(req.query.date).getFullYear();
    const query = {
      month: month.toString().padStart(2, '0'),
      year: year,
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
      overdue.forEach((i) => {
        i.isExistingData = true;
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
      });
      return res
        .status(200)
        .send({ status: 'SUCCESS', data: { docs: overdue, client } });
    } else {
      query.overdueAction === 'AMEND';
      let { overdue, lastMonth, lastYear } = await getLastOverdueList({
        query,
        date: req.query.date,
      });
      const response = {
        docs: overdue,
        client,
      };
      if (overdue && overdue.length !== 0) {
        overdue.forEach((i) => {
          i.isExistingData = true;
          i.month = month;
          i.year = year;
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
        });
        response.previousEntries = getMonthString(lastMonth) + ' ' + lastYear;
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
    let overdue = await Overdue.findOne({ _id: req.params.overdueId })
      .populate({
        path: 'clientId debtorId insurerId',
        select: 'name entityName',
      })
      .select({
        overdueAction: 0,
        analystComment: 0,
        isDeleted: 0,
        __v: 0,
        updatedAt: 0,
        createdAt: 0,
      })
      .lean();
    if (overdue) {
      overdue = await getDrawerDetails({ overdue });
    }
    return res.status(200).send({ status: 'SUCCESS', data: overdue });
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
 * Get overdue details
 */
router.get('/:overdueId', async function (req, res) {
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
    const overdue = await Overdue.findOne({ _id: req.params.overdueId })
      .populate({
        path: 'debtorId insurerId clientId',
        select: '_id name entityName',
      })
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    if (overdue) {
      if (overdue.overdueType) {
        overdue.overdueType = {
          label: overdue.overdueType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }),
          value: overdue.overdueType,
        };
      }
      if (overdue.debtorId) {
        overdue.debtorId = {
          label: overdue.debtorId.entityName,
          value: overdue.debtorId._id,
        };
      }
      if (overdue.insurerId) {
        overdue.insurerId = {
          label: overdue.insurerId.name,
          value: overdue.insurerId._id,
        };
      }
      if (overdue.month && overdue.year) {
        overdue.monthString = overdue.year + ',' + overdue.month;
      }
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: overdue,
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
 * Add overdue
 */
router.post('/', async function (req, res) {
  if (
    !req.body.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.body.debtorId) ||
    !req.body.acn ||
    !req.body.dateOfInvoice ||
    !req.body.overdueType ||
    !req.body.insurerId ||
    !req.body.month ||
    !req.body.year ||
    !req.body.hasOwnProperty('currentAmount') ||
    !req.body.hasOwnProperty('thirtyDaysAmount') ||
    !req.body.hasOwnProperty('sixtyDaysAmount') ||
    !req.body.hasOwnProperty('ninetyDaysAmount') ||
    !req.body.hasOwnProperty('ninetyPlusDaysAmount') ||
    !req.body.hasOwnProperty('outstandingAmount')
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const overdueDetail = await Overdue.findOne({
      clientId: req.user.clientId,
      debtorId: req.body.debtorId,
      month: req.body.month.toString().padStart(2, '0'),
      year: req.body.year.toString(),
    }).lean();
    if (overdueDetail) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'OVERDUE_ALREADY_EXISTS',
        message: 'Overdue already exists, please create with another debtor',
      });
    }
    let overdue = {
      clientId: req.user.clientId,
      debtorId: req.body.debtorId,
      acn: req.body.acn,
      dateOfInvoice: req.body.dateOfInvoice,
      overdueType: req.body.overdueType,
      insurerId: req.body.insurerId,
      month: req.body.month.toString().padStart(2, '0'),
      year: req.body.year,
      currentAmount: req.body.currentAmount,
      thirtyDaysAmount: req.body.thirtyDaysAmount,
      sixtyDaysAmount: req.body.sixtyDaysAmount,
      ninetyDaysAmount: req.body.ninetyDaysAmount,
      ninetyPlusDaysAmount: req.body.ninetyPlusDaysAmount,
      outstandingAmount: req.body.outstandingAmount,
      clientComment: req.body.clientComment,
      status: 'SUBMITTED',
    };
    const overdueData = await Overdue.create(overdue);
    overdue = await Overdue.findOne({ _id: overdueData._id })
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
      message: 'Overdue added successfully',
      data: overdue,
    });
  } catch (e) {
    Logger.log.error('Error occurred in add overdue', e.message || e);
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
  if (!req.body.list || req.body.list === 0) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const promises = [];
    let update = {};
    const overdueArr = req.body.list.map((i) => {
      return i.debtorId + i.month.toString().padStart(2, '0') + i.year;
    });
    console.log(overdueArr);
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
    for (let i = 0; i < req.body.list.length; i++) {
      if (
        !req.body.list[i].debtorId ||
        !mongoose.Types.ObjectId.isValid(req.body.list[i].debtorId) ||
        !req.body.list[i].month ||
        !req.body.list[i].year ||
        !req.body.list[i].acn ||
        !req.body.list[i].dateOfInvoice ||
        !req.body.list[i].overdueType ||
        !req.body.list[i].insurerId ||
        !req.body.list[i].hasOwnProperty('isExistingData') ||
        (req.body.list[i].isExistingData && !req.body.list[i].overdueAction)
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing.',
        });
      }
      update = {};
      update.clientId = req.user.clientId;
      if (req.body.list[i].debtorId)
        update.debtorId = req.body.list[i].debtorId;
      if (req.body.list[i].acn) update.acn = req.body.list[i].acn;
      if (req.body.list[i].dateOfInvoice)
        update.dateOfInvoice = req.body.list[i].dateOfInvoice;
      if (req.body.list[i].overdueType)
        update.overdueType = req.body.list[i].overdueType;
      if (req.body.list[i].insurerId)
        update.insurerId = req.body.list[i].insurerId;
      if (req.body.list[i].month)
        update.month = req.body.list[i].month.toString().padStart(2, '0');
      if (req.body.list[i].year) update.year = req.body.list[i].year.toString();
      if (req.body.list[i].currentAmount)
        update.currentAmount = req.body.list[i].currentAmount;
      if (req.body.list[i].thirtyDaysAmount)
        update.thirtyDaysAmount = req.body.list[i].thirtyDaysAmount;
      if (req.body.list[i].sixtyDaysAmount)
        update.sixtyDaysAmount = req.body.list[i].sixtyDaysAmount;
      if (req.body.list[i].ninetyDaysAmount)
        update.ninetyDaysAmount = req.body.list[i].ninetyDaysAmount;
      if (req.body.list[i].ninetyPlusDaysAmount)
        update.ninetyPlusDaysAmount = req.body.list[i].ninetyPlusDaysAmount;
      if (req.body.list[i].outstandingAmount)
        update.outstandingAmount = req.body.list[i].outstandingAmount;
      if (req.body.list[i].clientComment)
        update.clientComment = req.body.list[i].clientComment;
      update.overdueAction = req.body.list[i].overdueAction
        ? req.body.list[i].overdueAction
        : 'UNCHANGED';
      update.status = req.body.list[i].status
        ? req.body.list[i].status
        : 'SUBMITTED';
      if (!req.body.list[i]._id) {
        promises.push(Overdue.create(update));
      } else {
        const overdue = await Overdue.findOne({
          clientId: update.clientId,
          debtorId: update.debtorId,
          month: update.month,
          year: update.year,
        }).lean();
        if (overdue && overdue._id.toString() !== req.body.list[i]._id) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'OVERDUE_ALREADY_EXISTS',
            message:
              'Overdue already exists, please create with another debtor',
          });
        }
        promises.push(
          Overdue.updateOne({ _id: req.body.list[i]._id }, update, {
            upsert: true,
          }),
        );
      }
    }
    await Promise.all(promises);
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

/**
 * Update overdue
 */
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

/**
 * Export Router
 */
module.exports = router;
