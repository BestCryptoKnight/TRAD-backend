/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
let User = mongoose.model('user');
const ClientUser = mongoose.model('client-user');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');
const {
  getClientDebtorDetails,
  getClientCreditLimit,
  downloadDecisionLetter,
} = require('../helper/client-debtor.helper');
const {
  getCurrentDebtorList,
  getDebtorFullAddress,
} = require('../helper/debtor.helper');
const { generateExcel } = require('./../helper/excel.helper');
const {
  generateNewApplication,
  checkForPendingApplication,
} = require('./../helper/application.helper');
const { getStakeholderList } = require('./../helper/stakeholder.helper');
const { addAuditLog } = require('./../helper/audit-log.helper');

router.get('/', async function (req, res) {
  if (!req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-limit',
    );
    const hasOnlyReadAccessForApplicationModule = false;
    const hasOnlyReadAccessForDebtorModule = false;
    const response = await getClientCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn.columns,
      clientId: req.user.clientId,
      moduleColumn: module.manageColumns,
      hasOnlyReadAccessForApplicationModule,
      hasOnlyReadAccessForDebtorModule,
      isForRisk: true,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get Credit Limit data ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

router.get('/entity-list', async function (req, res) {
  try {
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const debtors = await getCurrentDebtorList({
      showCompleteList: req.query?.isForFilter || true,
      page: req.query.page,
      limit: req.query.limit,
      isForRisk: true,
      userId: req.user._id,
      hasFullAccess,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        debtors: { field: 'debtorId', data: debtors },
        entityType: { field: 'entityType', data: StaticData.entityType },
      },
    });
  } catch (error) {}
});

router.get('/column-name', async function (req, res) {
  try {
    let module = [];
    let clientColumn = [];
    if (req?.query?.columnFor == 'stakeholder') {
      module = StaticFile.modules.find((i) => i.name === 'stakeholder');
      clientColumn = req.user.manageColumns.find(
        (i) => i.moduleName === 'stakeholder',
      );
    } else {
      module = StaticFile.modules.find((i) => i.name === 'credit-limit');
      clientColumn = req.user.manageColumns.find(
        (i) => i.moduleName === 'credit-limit',
      );
    }
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        clientColumn &&
        clientColumn.columns.includes(module.manageColumns[i].name)
      ) {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        }
      } else {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        }
      }
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', data: { defaultFields, customFields } });
  } catch (e) {
    Logger.log.error('Error occurred in get column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get StakeHolder List
 */
router.get('/stakeholder/:creditLimitId', async function (req, res) {
  if (
    !req.params.creditLimitId ||
    !mongoose.Types.ObjectId.isValid(req.params.creditLimitId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'stakeholder');
    const stakeholderColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'stakeholder',
    );
    const response = await getStakeholderList({
      debtorId: req.params.creditLimitId,
      requestedQuery: req.query,
      manageColumns: module.manageColumns,
      stakeholderColumn: stakeholderColumn.columns,
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in get stakeholder list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Excel
 */
router.get('/download', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const debtorColumn = [
      'entityName',
      'entityType',
      'stakeHolder',
      'abn',
      'acn',
      'registrationNumber',
      'country',
      'requestedAmount',
      'creditLimit',
      'approvalOrDecliningDate',
      'expiryDate',
      'limitType',
      'clientReference',
      'comments',
    ];
    const response = await getClientCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn,
      clientId: req.user.clientId,
      moduleColumn: module.manageColumns,
      isForDownload: true,
    });
    if (response && response?.docs.length > 20000) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOWNLOAD_LIMIT_EXCEED',
        message:
          'User cannot download more than 20000 records at a time. Please apply filter to narrow down the list',
      });
    }
    if (response && response.docs.length !== 0) {
      const headers = [
        { name: 'entityName', label: 'Debtor Name', type: 'string' },
        { name: 'stakeHolder', label: 'Stakeholder', type: 'string' },
        { name: 'abn', label: 'ABN/NZBN', type: 'string' },
        { name: 'acn', label: 'ACN/NCN', type: 'string' },
        {
          name: 'registrationNumber',
          label: 'Registration Number',
          type: 'string',
        },
        { name: 'country', label: 'Country', type: 'string' },
        {
          name: 'requestedAmount',
          label: 'Requested Amount',
          type: 'amount',
        },
        {
          name: 'creditLimit',
          label: 'Approved Amount',
          type: 'amount',
        },
        {
          name: 'approvalOrDecliningDate',
          label: 'Approval Date',
          type: 'date',
        },
        { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
        { name: 'limitType', label: 'Limit Type', type: 'string' },
        {
          name: 'clientReference',
          label: 'Client Reference',
          type: 'string',
        },
        { name: 'comments', label: 'Comments', type: 'string' },
      ];
      const finalArray = [];
      let data = {};
      response.docs.forEach((i) => {
        data = {};
        debtorColumn.map((key) => {
          data[key] = i[key];
        });
        finalArray.push(data);
      });
      const client = await Client.findOne({ _id: req.user.clientId })
        .select('clientCode name')
        .lean();
      response.filterArray.unshift({
        label: 'Client Name',
        value: client?.name,
        type: 'string',
      });
      const excelData = await generateExcel({
        data: finalArray,
        reportFor: 'Credit Limit List',
        headers,
        filter: response.filterArray,
      });
      res.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const fileName =
        client?.clientCode + '-credit-limit-' + Date.now() + '.xlsx';
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      res.status(200).send(excelData);
    } else {
      res.status(400).send({
        status: 'ERROR',
        message: 'No data found for download file',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in download credit-limit in csv', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Decision Letter
 */
router.get(
  '/download/decision-letter/:creditLimitId',
  async function (req, res) {
    try {
      const { bufferData, applicationNumber } = await downloadDecisionLetter({
        creditLimitId: req.params.creditLimitId,
      });
      if (bufferData) {
        const fileName = applicationNumber + '_CreditCheckDecision.pdf';
        res
          .writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename=' + fileName,
          })
          .end(bufferData);
      } else {
        res.status(400).send({
          status: 'ERROR',
          message: 'No decision letter found',
        });
      }
    } catch (e) {
      Logger.log.error('Error occurred in download Decision Letter', e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Get Details
 */
router.get('/:creditLimitId', async function (req, res) {
  if (!req.params.creditLimitId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let debtor = await ClientDebtor.findOne({
      _id: req.params.creditLimitId,
    })
      .populate({
        path: 'debtorId',
        select: { isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 },
      })
      .lean();
    debtor = debtor.debtorId;
    if (debtor) {
      if (debtor.address) {
        for (let key in debtor.address) {
          debtor[key] = debtor.address[key];
        }
        debtor.address = getDebtorFullAddress({
          address: debtor.address,
          country: debtor.address.country,
        });
      }
      if (debtor.country) {
        debtor.country = {
          label: debtor.country.name,
          value: debtor.country.code,
        };
      }
      if (debtor.entityType) {
        debtor.entityType = {
          label: debtor.entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }),
          value: debtor.entityType,
        };
      }
      if (debtor.entityName) {
        debtor.entityName = {
          label: debtor.entityName,
          value: debtor.entityName,
        };
      }
      if (debtor.state) {
        const state = StaticData.australianStates.find((i) => {
          if (i._id === debtor.state) return i;
        });
        if (state) {
          debtor.state = {
            label: state.name,
            value: debtor.state,
          };
        }
      }
      if (debtor.streetType) {
        const streetType = StaticData.streetType.find((i) => {
          if (i._id === debtor.streetType) return i;
        });
        if (streetType) {
          debtor.streetType = {
            label: streetType.name,
            value: debtor.streetType,
          };
        }
      }
    }
    res.status(200).send({ status: 'SUCCESS', data: debtor });
  } catch (e) {
    Logger.log.error('Error occurred in get debtor details', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Column Names
 */
router.put('/column-name', async function (req, res) {
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.warn('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.columnFor == 'stakeholder') {
      if (req.body.isReset) {
        const module = StaticFile.modules.find((i) => i.name === 'stakeholder');
        updateColumns = module.defaultColumns;
      } else {
        updateColumns = req.body.columns;
      }
      await ClientUser.updateOne(
        { _id: req.user._id, 'manageColumns.moduleName': 'stakeholder' },
        { $set: { 'manageColumns.$.columns': updateColumns } },
      );
    } else {
      if (req.body.isReset) {
        const module = StaticFile.modules.find(
          (i) => i.name === 'credit-limit',
        );
        updateColumns = module.defaultColumns;
      } else {
        updateColumns = req.body.columns;
      }
      await ClientUser.updateOne(
        { _id: req.user._id, 'manageColumns.moduleName': 'credit-limit' },
        { $set: { 'manageColumns.$.columns': updateColumns } },
      );
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Columns updated successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in update credit-limit column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update credit-limit
 */
router.put('/credit-limit/:creditLimitId', async function (req, res) {
  if (
    !req.params.creditLimitId ||
    !mongoose.Types.ObjectId.isValid(req.params.creditLimitId) ||
    !req.body.action
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const clientDebtor = await ClientDebtor.findOne({
      _id: req.params.creditLimitId,
    })
      .populate({ path: 'clientId debtorId', select: 'name entityName' })
      .lean();
    if (req.body.action === 'modify') {
      if (
        !req.body.creditLimit.toString() ||
        typeof req.body.creditLimit !== 'number' ||
        isNaN(req.body.creditLimit)
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing',
        });
      }
      const isPendingApplication = await checkForPendingApplication({
        clientId: clientDebtor?.clientId?._id,
        debtorId: clientDebtor?.debtorId?._id,
      });
      if (isPendingApplication) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message: `Application already exists for the Client: ${clientDebtor?.clientId?.name} & Debtor: ${clientDebtor?.debtorId?.entityName}`,
        });
      }
      await addAuditLog({
        entityType: 'credit-limit',
        entityRefId: req.params.creditLimitId,
        actionType: 'edit',
        userType: 'user',
        userRefId: req.user._id,
        logDescription: `A credit limit of ${clientDebtor?.clientId?.name} ${clientDebtor?.debtorId?.entityName} is modified by ${req.user.name}`,
      });
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdByType: 'user',
        createdById: req.user._id,
        creditLimit: req.body.creditLimit,
        applicationId: clientDebtor?.activeApplicationId,
      });
    } else {
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdByType: 'user',
        createdById: req.user._id,
        creditLimit: 0,
        applicationId: clientDebtor?.activeApplicationId,
        isSurrender: true,
      });
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Credit limit updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update credit-limit', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

module.exports = router;
