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
} = require('./../helper/overdue.helper');

/**
 * Get Entity List
 */
router.get('/entity-list', async function (req, res) {
  try {
    const clientDebtors = await ClientDebtor.find({
      isActive: true,
      clientId: req.user.clientId,
      creditLimit: { $exists: true, $ne: null },
    })
      .populate({ path: 'debtorId', select: '_id entityName' })
      .select('debtorId')
      .lean();
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
    const debtors = [];
    clientDebtors.forEach((i) => {
      if (i.debtorId && i.debtorId.entityName) {
        debtors.push({ _id: i.debtorId._id, name: i.debtorId.entityName });
      }
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
        path: 'debtorId insurerId clientId',
        select: '_id name entityName',
      })
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    if (overdue && overdue.length !== 0) {
      return res.status(200).send({ status: 'SUCCESS', data: overdue });
    } else {
      query.overdueAction === 'AMEND';
      let overdue = await getLastOverdueList({
        query,
        date: req.query.date,
      });
      let update = {};
      const promises = [];
      overdue.forEach((i) => {
        update = {
          clientId: i.clientId && i.clientId._id ? i.clientId._id : i.clientId,
          debtorId: i.debtorId && i.debtorId._id ? i.debtorId._id : i.debtorId,
          acn: i.acn,
          dateOfInvoice: i.dateOfInvoice,
          overdueType: i.overdueType,
          insurerId:
            i.insurerId && i.insurerId._id ? i.insurerId._id : i.insurerId,
          month: month.toString().padStart(2, '0'),
          year: year,
          currentAmount: i.currentAmount,
          thirtyDaysAmount: i.thirtyDaysAmount,
          sixtyDaysAmount: i.sixtyDaysAmount,
          ninetyDaysAmount: i.ninetyDaysAmount,
          ninetyPlusDaysAmount: i.ninetyPlusDaysAmount,
          outstandingAmount: i.outstandingAmount,
          status: 'SUBMITTED',
        };
        promises.push(Overdue.create(update));
      });
      await Promise.all(promises);
      overdue = await Overdue.find({
        month: month.toString().padStart(2, '0'),
        year: year,
        clientId: req.user.clientId,
      })
        .populate({
          path: 'debtorId insurerId clientId',
          select: '_id name entityName',
        })
        .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
        .lean();
      overdue.forEach((i) => (i.isExistingData = true));
      return res.status(200).send({ status: 'SUCCESS', data: overdue });
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
        status: 0,
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
    !req.body.currentAmount ||
    !req.body.thirtyDaysAmount ||
    !req.body.sixtyDaysAmount ||
    !req.body.ninetyDaysAmount ||
    !req.body.ninetyPlusDaysAmount ||
    !req.body.outstandingAmount
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
      month: req.body.month,
      year: req.body.year,
    }).lean();
    if (overdueDetail) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'OVERDUE_ALREADY_EXISTS',
        message: 'Overdue already exists, please create with another debtor',
      });
    }
    const overdue = {
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
    await Overdue.create(overdue);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Overdue added successfully' });
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
    for (let i = 0; i < req.body.list.length; i++) {
      if (
        req.body.list[i].hasOwnProperty(req.body.list[i].isExistingData) &&
        req.body.list[i].isExistingData &&
        !req.body.list[i].overdueAction
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing.',
        });
      }
      if (req.body.list[i].overdueAction) {
        promises.push(
          Overdue.updateOne(
            { _id: req.body.list[i]._id },
            { overdueAction: req.body.list[i].overdueAction },
          ),
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
        query.month = req.body.month;
        query.year = req.body.year;
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
    if (req.body.debtorId) update.req.body.debtorId = req.body.debtorId;
    if (req.body.acn) update.req.body.acn = req.body.acn;
    if (req.body.dateOfInvoice)
      update.req.body.dateOfInvoice = req.body.dateOfInvoice;
    if (req.body.overdueType)
      update.req.body.overdueType = req.body.overdueType;
    if (req.body.insurerId) update.req.body.insurerId = req.body.insurerId;
    if (req.body.month)
      update.req.body.month = req.body.month.toString().padStart(2, '0');
    if (req.body.currentAmount)
      update.req.body.currentAmount = req.body.currentAmount;
    if (req.body.thirtyDaysAmount)
      update.req.body.thirtyDaysAmount = req.body.thirtyDaysAmount;
    if (req.body.sixtyDaysAmount)
      update.req.body.sixtyDaysAmount = req.body.sixtyDaysAmount;
    if (req.body.ninetyDaysAmount)
      update.req.body.ninetyDaysAmount = req.body.ninetyDaysAmount;
    if (req.body.ninetyPlusDaysAmount)
      update.req.body.ninetyPlusDaysAmount = req.body.ninetyPlusDaysAmount;
    if (req.body.outstandingAmount)
      update.req.body.outstandingAmount = req.body.outstandingAmount;
    await Overdue.updateOne({ _id: req.params.overdueId }, update);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Overdue updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in update overdue', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Overdue
 */
router.delete('/:entityId', async function (req, res) {
  if (
    !req.params.entityId ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    await Overdue.updateOne({ _id: req.params.entityId }, { isDeleted: true });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Overdue deleted successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete overdue ', e.message || e);
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
