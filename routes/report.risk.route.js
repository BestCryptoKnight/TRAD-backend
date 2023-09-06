/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Alert = mongoose.model('alert');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');
const {
  getClientListReport,
  getLimitListReport,
  getPendingApplicationReport,
  getUsageReport,
  getUsagePerClientReport,
  getLimitHistoryReport,
  getClaimsReport,
  getReviewReport,
  getAlertReport,
} = require('./../helper/report.helper');
const { getClientList } = require('./../helper/client.helper');
const { insurerList } = require('./../helper/task.helper');
const { getUserList } = require('./../helper/user.helper');
const { generateExcel } = require('./../helper/excel.helper');
const { getCurrentDebtorList } = require('./../helper/debtor.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.columnFor + '-report',
    );
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor + '-report',
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        reportColumn &&
        reportColumn.columns.includes(module.manageColumns[i].name)
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
    Logger.log.error('Error occurred in get task column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Entity List
 * */
router.get('/entity-list', async function (req, res) {
  try {
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const [clients, debtors, insurers] = await Promise.all([
      getClientList({
        hasFullAccess: hasFullAccess,
        userId: req.user._id,
        sendCRMIds: true,
        page: req.query.page,
        limit: req.query.limit,
      }),
      getCurrentDebtorList({
        userId: req.user._id,
        hasFullAccess: hasFullAccess,
        isForRisk: true,
        limit: req.query.limit,
        page: req.query.page,
        showCompleteList: false,
        isForOverdue: false,
      }),
      insurerList(),
    ]);
    const { riskAnalystList, serviceManagerList } = await getUserList();
    clients.map((i) => {
      i.clientId = i.crmClientId;
      delete i.crmClientId;
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        clientIds: clients,
        debtorId: debtors,
        insurerId: insurers,
        riskAnalystId: riskAnalystList,
        serviceManagerId: serviceManagerList,
        entityType: StaticData.entityType,
        limitType: StaticData.limitType,
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get entity list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Alert Entity List
 */
router.get('/alert-entity-list', async function (req, res) {
  try {
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const [alertPriority, alertType, clients] = await Promise.all([
      Alert.find().distinct('alertPriority'),
      Alert.find().distinct('alertType'),
      getClientList({
        hasFullAccess: hasFullAccess,
        userId: req.user._id,
        sendCRMIds: true,
        page: req.query.page,
        limit: req.query.limit,
      }),
    ]);
    clients.map((i) => {
      i.clientId = i.crmClientId;
      delete i.crmClientId;
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        clientIds: clients,
        alertType,
        alertPriority,
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get entity list for alert report',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Report List
 */
router.get('/', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const report = req.query.columnFor + '-report';
    const module = StaticFile.modules.find((i) => i.name === report);
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === report,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    let hasFullAccess = false;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') !== -1) {
      hasFullAccess = true;
    }
    let response;
    switch (report) {
      case 'client-list-report':
        response = await getClientListReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'limit-list-report':
        response = await getLimitListReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'pending-application-report':
        response = await getPendingApplicationReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'review-report':
        response = await getReviewReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'usage-report':
        response = await getUsageReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'usage-per-client-report':
        response = await getUsagePerClientReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'limit-history-report':
        response = await getLimitHistoryReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'claims-report':
        response = await getClaimsReport({
          reportColumn: reportColumn.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      case 'alert-report':
        response = await getAlertReport({
          reportColumn: reportColumn?.columns,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
        });
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (reportColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: response.response,
        headers,
        total: response.total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(response.total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get report list');
    Logger.log.error(e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Report in Excel
 */
router.get('/download', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const report = req.query.columnFor + '-report';
    const module = StaticFile.modules.find((i) => i.name === report);
    let reportColumn = [];
    let hasFullAccess = false;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') !== -1) {
      hasFullAccess = true;
    }
    let response;
    let reportFor;
    switch (report) {
      case 'limit-list-report':
        reportColumn = [
          'clientId',
          'insurerId',
          'debtorId',
          'stakeHolder',
          'abn',
          'acn',
          'registrationNumber',
          'country',
          'applicationId',
          'creditLimit',
          'acceptedAmount',
          'approvalOrDecliningDate',
          'expiryDate',
          'limitType',
          'clientReference',
          'comments',
        ];
        reportFor = 'Limit List';
        response = await getLimitListReport({
          reportColumn: reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      case 'alert-report':
        reportColumn = [
          'clientName',
          'debtorName',
          'alertCategory',
          'alertType',
          'alertDate',
          'alertPriority',
        ];
        reportFor = 'Alert Report';
        response = await getAlertReport({
          reportColumn: reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      case 'pending-application-report':
        reportColumn = [
          'clientId',
          'insurerId',
          'debtorId',
          'entityType',
          'applicationId',
          'status',
          'creditLimit',
          'limitType',
          'requestDate',
        ];
        reportFor = 'Pending Application';
        response = await getPendingApplicationReport({
          reportColumn: reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      case 'review-report':
        reportColumn = [
          'clientId',
          'entityName',
          'abn',
          'acn',
          'registrationNumber',
          'entityType',
          'reviewDate',
          'country',
          'riskRating',
          'tradingName',
          'insurerId',
          'property',
          'unitNumber',
          'streetNumber',
          'streetName',
          'streetType',
          'suburb',
          'state',
          'postCode',
          'contactNumber',
        ];
        reportFor = 'Review Report';
        response = await getReviewReport({
          reportColumn: reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      case 'usage-report':
        reportColumn = [
          'name',
          'insurerId',
          'creditChecks',
          'creditChecksUsed',
          'nzCreditChecks',
          'nzCreditChecksUsed',
          'healthChecks',
          'healthChecksUsed',
          'alerts247',
          'alerts247Used',
          'policyNumber',
          'inceptionDate',
          'expiryDate',
          'riskAnalystId',
          'serviceManagerId',
        ];
        reportFor = 'Usage Report';
        response = await getUsageReport({
          reportColumn: reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      case 'usage-per-client-report':
        reportColumn = [
          'clientId',
          'insurerId',
          'debtorId',
          'entityType',
          'abn',
          'acn',
          'registrationNumber',
          'country',
          'creditLimitStatus',
          'creditLimit',
          'applicationCount',
          'applicationId',
          'status',
          'requestedAmount',
          'acceptedAmount',
          'approvalOrDecliningDate',
          'expiryDate',
          'limitType',
          'clientReference',
          'comments',
        ];
        reportFor = 'Usage per Client Report';
        response = await getUsagePerClientReport({
          reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      case 'limit-history-report':
        reportColumn = [
          'applicationId',
          'status',
          'clientId',
          'debtorId',
          'entityType',
          'abn',
          'acn',
          'registrationNumber',
          'country',
          'insurerId',
          'creditLimit',
          'acceptedAmount',
          'approvalOrDecliningDate',
          'expiryDate',
          'limitType',
          'clientReference',
          'comments',
        ];
        reportFor = 'Limit History Report';
        response = await getLimitHistoryReport({
          reportColumn,
          hasFullAccess,
          userId: req.user._id,
          requestedQuery: req.query,
          isForDownload: true,
        });
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    if (response && response?.response.length > 20000) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOWNLOAD_LIMIT_EXCEED',
        message:
          'User cannot download more than 20000 records at a time. Please apply filter to narrow down the list',
      });
    }
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (reportColumn.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    const finalArray = [];
    let data = {};
    if (response && response.response.length !== 0) {
      response.response.forEach((i) => {
        data = {};
        reportColumn.map((key) => {
          data[key] = i[key];
        });
        finalArray.push(data);
      });
    }

    const excelData = await generateExcel({
      data: finalArray,
      reportFor: reportFor,
      headers,
      filter: response.filterArray,
      title: 'Report for',
    });

    const fileName = report + '-' + new Date().getTime() + '.xlsx';
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
    res.status(200).send(excelData);
  } catch (e) {
    Logger.log.error('Error occurred in download report');
    Logger.log.error(e.message || e);
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
  if (
    !req.body.hasOwnProperty('isReset') ||
    !req.body.columns ||
    !req.body.columnFor
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    req.body.columnFor = req.body.columnFor + '-report';
    let updateColumns = [];
    let module;
    switch (req.body.columnFor) {
      case 'client-list-report':
      case 'limit-list-report':
      case 'pending-application-report':
      case 'review-report':
      case 'usage-report':
      case 'usage-per-client-report':
      case 'limit-history-report':
      case 'claims-report':
      case 'alert-report':
        if (req.body.isReset) {
          module = StaticFile.modules.find(
            (i) => i.name === req.body.columnFor,
          );
          updateColumns = module.defaultColumns;
        } else {
          updateColumns = req.body.columns;
        }
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': req.body.columnFor },
      { $set: { 'manageColumns.$.columns': updateColumns } },
    );
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Columns updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in update column names', e.message || e);
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
