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
  getMonthString,
  formatString,
  updateList,
} = require('./../helper/overdue.helper');
const { getCurrentDebtorList } = require('./../helper/debtor.helper');

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
    const { acnResponse, response } = await getCurrentDebtorList({
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
      { _id: 'RETURNED_CHEQUE', name: 'Returned Cheque' },
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
        acnResponse: acnResponse,
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
      overdue.forEach((i) => {
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
      });
      return res
        .status(200)
        .send({ status: 'SUCCESS', data: { docs: overdue, client } });
    } else {
      query.overdueAction = { $ne: 'MARK_AS_PAID' };
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

/*/!**
 * Get overdue details
 *!/
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
            .replace(/\w\S*!/g, function (txt) {
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
});*/

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
    const response = await updateList({
      isForRisk: false,
      requestBody: req.body,
      clientId: req.user.clientId,
    });
    if (response && response.status && response.status === 'ERROR') {
      return res.status(400).send(response);
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
