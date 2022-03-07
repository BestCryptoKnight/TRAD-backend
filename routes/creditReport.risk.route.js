/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Debtor = mongoose.model('debtor');
const CreditReport = mongoose.model('credit-report');
const User = mongoose.model('user');
const DebtorDirector = mongoose.model('debtor-director');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { fetchCreditReportInPDFFormat } = require('./../helper/illion.helper');
const StaticFile = require('./../static-files/moduleColumn');
const {
  uploadFile,
  downloadDocument,
} = require('./../helper/static-file.helper');
const { sendNotification } = require('./../helper/socket.helper');
const {
  updateActiveReportInCreditLimit,
} = require('./../helper/client-debtor.helper');
const { storePDFCreditReport } = require('./../helper/automation.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-report');
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-report',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (reportColumn.columns.includes(module.manageColumns[i].name)) {
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
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Get Report List
 */
router.get('/list/:debtorId', async function (req, res) {
  if (!req.params.debtorId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await Debtor.findOne({ _id: req.params.debtorId }).lean();
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
    let reports = [];
    const partners = [];
    if (debtor.entityType === 'PARTNERSHIP' || debtor.entityType === 'TRUST') {
      const stakeholders = await DebtorDirector.find({
        debtorId: debtor._id,
      })
        .select('_id type entityName firstName lastName')
        .lean();
      stakeholders.forEach((i) => {
        partners.push({
          label:
            i.type === 'company'
              ? i.entityName
              : i.firstName + ' ' + i.lastName,
          value: i._id,
          type: i.type,
        });
      });
    }
    if (debtor.entityType !== 'SOLE_TRADER' && debtor.address) {
      if (debtor.address.country && debtor.address.country.code === 'AUS') {
        reports = [
          {
            value: 'HXBSC',
            label: 'HTML Commercial Bureau Enquiry without ASIC Docs',
          },
          {
            value: 'HXBCA',
            label:
              'HTML Commercial Bureau Enquiry w/ refresh ASIC w/o ASIC Docs',
          },
          {
            value: 'HXPAA',
            label: 'HTML Payment Analysis & ASIC Current Extract',
          },
          {
            value: 'HXPYA',
            label: 'Risk of Late Payment Report (DDS)',
          },
        ];
      } else {
        reports = [
          {
            value: 'HNBCau',
            label: 'HTML NZ Comm. Bureau Enq (AU Subs)',
          },
          {
            value: 'NPA',
            label: 'HTML Payment Analysis with refreshed NZCO',
          },
        ];
      }
    }
    res.status(200).send({ status: 'SUCCESS', data: { reports, partners } });
  } catch (e) {
    Logger.log.error('Error occurred in get report list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Download Credit Report
 */
router.get('/download/:reportId', async function (req, res) {
  if (!req.params.reportId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const report = await CreditReport.findOne({
      _id: req.params.reportId,
    }).lean();
    if (report?.keyPath && report?.originalFileName) {
      const response = await downloadDocument({
        filePath: report.keyPath,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=' + report.originalFileName,
      );
      return response.pipe(res);
    } else {
      res.status(400).send({
        status: 'ERROR',
        message: 'No data found for download file',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in download Credit Report', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Credit Report
 */
router.get('/:debtorId', async function (req, res) {
  if (!req.params.debtorId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-report');
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-report',
    );
    const debtor = await Debtor.findOne({ _id: req.params.debtorId }).lean();
    const entityTypes = ['TRUST', 'PARTNERSHIP'];
    let entityIds = [debtor._id];
    if (debtor && entityTypes.includes(debtor.entityType)) {
      const directors = await DebtorDirector.find({
        debtorId: req.params.debtorId,
      }).lean();
      directors.forEach((i) => {
        entityIds.push(i._id);
      });
    }
    const queryFilter = {
      isDeleted: false,
      entityId: { $in: entityIds },
    };
    if (req.query.startDate && req.query.endDate) {
      queryFilter.createdAt = {
        $gte: req.query.startDate,
        $lte: req.query.endDate,
      };
    }
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || 'expiryDate';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    sortingOptions[req.query.sortBy] = req.query.sortOrder;
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    option.select = reportColumn.columns.toString().replace(/,/g, ' ');
    option.sort = sortingOptions;
    option.lean = true;
    let responseObj = await CreditReport.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (reportColumn.columns.includes(module.manageColumns[i].name)) {
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error(
      'Error occurred in fetching Credit Reports',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Generate Credit Report
 */
router.put('/generate', async function (req, res) {
  if (
    !req.body.debtorId ||
    !req.body.productCode ||
    !mongoose.Types.ObjectId.isValid(req.body.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const entityTypes = ['TRUST', 'PARTNERSHIP'];
    const debtor = await Debtor.findOne({ _id: req.body.debtorId })
      .select('abn acn entityType address')
      .lean();
    if (debtor) {
      const report = await CreditReport.findOne({
        isDeleted: false,
        isExpired: false,
        entityId:
          entityTypes.includes(debtor.entityType) && req.body.stakeholderId
            ? req.body.stakeholderId
            : debtor._id,
        productCode: req.body.productCode,
        expiryDate: { $gt: new Date() },
      });
      if (report) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REPORT_ALREADY_EXISTS',
          message: 'Report already exists',
        });
      }
      if (
        !debtor.abn &&
        !debtor.acn &&
        !debtor.address &&
        !debtor.address.country
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'ABN_AND_ACN_NOT_PRESENT',
          message: 'Require fields are missing.',
        });
      }
      let searchField;
      let searchValue;
      if (debtor.address.country.code === 'AUS') {
        searchField = debtor.abn ? 'ABN' : 'ACN';
        searchValue = debtor.abn ? debtor.abn : debtor.acn;
      } else {
        searchField = 'NCN';
        searchValue = debtor.acn ? debtor.acn : '';
      }
      let entityId = req.body.debtorId;
      let entityType = 'debtor';
      if (entityTypes.includes(debtor.entityType)) {
        if (
          !req.body.stakeholderId ||
          !mongoose.Types.ObjectId.isValid(req.body.stakeholderId)
        ) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'NO_STAKEHOLDER_FOUND',
            message:
              'Sorry! Report cannot be fetched, as no respective stakeholder found to perform this operation',
          });
        }
        const stakeholder = await DebtorDirector.findOne({
          _id: req.body.stakeholderId,
        }).lean();
        if (!stakeholder) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'NO_STAKEHOLDER_FOUND',
            message: 'No stakeholder found',
          });
        }
        entityId = stakeholder._id;
        entityType = 'debtor-director';
        if (stakeholder.country && stakeholder.country.code === 'AUS') {
          searchValue = stakeholder.abn ? stakeholder.abn : stakeholder.acn;
          searchField = stakeholder.abn ? 'ABN' : 'ACN';
        } else {
          searchValue = stakeholder.acn ? stakeholder.acn : '';
          searchField = 'NCN';
        }
      }
      if (searchField && searchValue) {
        res.status(200).send({
          status: 'SUCCESS',
          message:
            'Your download request is in progress, you will be get notification for the download result',
        });
        const notificationBody = {
          notificationObj: {
            type: 'REPORT_NOTIFICATION',
            fetchStatus: '',
            message: '',
            debtorId: req.body.debtorId,
          },
          type: 'user',
          userId: req.user._id,
        };
        const reportData = await fetchCreditReportInPDFFormat({
          searchField,
          searchValue,
          countryCode: debtor.address.country.code,
          productCode: req.body.productCode,
        });
        if (
          reportData &&
          reportData.Status &&
          reportData.Status.Success &&
          !reportData.Status.Error
        ) {
          if (
            reportData &&
            reportData.Response &&
            reportData.Response.Messages.hasOwnProperty('ErrorCount') &&
            reportData.Response.Messages.ErrorCount === 0
          ) {
            const date = new Date();
            let expiryDate = new Date(date.setMonth(date.getMonth() + 12));
            expiryDate = new Date(expiryDate.setDate(expiryDate.getDate() - 1));
            const response = {
              entityId: entityId,
              productCode: req.body.productCode,
              creditReport: reportData.Response,
              reportProvider: 'illion',
              entityType: entityType,
              name: reportData.Response.Header.ProductName,
              expiryDate: expiryDate,
            };
            const reportDetails = await CreditReport.create(response);
            if (reportData.ReportsData && reportData.ReportsData.length) {
              pdfData = reportData.ReportsData.find(
                (element) =>
                  element.ReportFormat === 2 && element.Base64EncodedData,
              );
              if (pdfData && pdfData.Base64EncodedData) {
                storePDFCreditReport({
                  reportId: reportDetails._id,
                  productCode: req.body.productCode,
                  pdfBase64: pdfData.Base64EncodedData,
                });
              }
            }
            if (
              reportData.Response.DynamicDelinquencyScore &&
              reportData.Response.DynamicDelinquencyScore &&
              reportData.Response.DynamicDelinquencyScore.Score
            ) {
              await Debtor.updateOne(
                { _id: debtor._id },
                {
                  riskRating: reportData.Response.DynamicDelinquencyScore.Score,
                },
              );
            }
            notificationBody.notificationObj.fetchStatus = 'SUCCESS';
            notificationBody.notificationObj.message =
              'Report generated successfully';
            await updateActiveReportInCreditLimit({
              reportDetails,
              debtorId: req.body.debtorId,
            });
          } else {
            const message =
              reportData.Response.Messages.Error &&
              reportData.Response.Messages.Error.Desc &&
              reportData.Response.Messages.Error.Num
                ? reportData.Response.Messages.Error.Num +
                  ' - ' +
                  reportData.Response.Messages.Error.Desc
                : 'Unable to fetch report';
            notificationBody.notificationObj.fetchStatus = 'ERROR';
            notificationBody.notificationObj.message = message;
          }
        } else {
          notificationBody.notificationObj.fetchStatus = 'ERROR';
          notificationBody.notificationObj.message =
            reportData.Status.ErrorMessage || 'Error in fetching Credit Report';
        }
        sendNotification(notificationBody);
      } else {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'UNABLE_TO_FETCH_REPORT',
          data: 'Unable to fetch report',
        });
      }
    } else {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in generating Credit Report', e);
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
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'credit-report');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'credit-report' },
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
 * Update Credit Report
 */
router.put('/:id', async function (req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing.',
      });
    }
    let updateObj = {};
    if (req.body.hasOwnProperty('isExpired'))
      updateObj['isExpired'] = req.body.isExpired;
    if (req.body.expiryDate) updateObj['expiryDate'] = req.body.expiryDate;
    await CreditReport.updateOne({ _id: req.params.id }, updateObj);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Report updated successfully.',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in updating Credit Report',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

module.exports = router;
