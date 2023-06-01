/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');
const Application = mongoose.model('application');
const DebtorDirector = mongoose.model('debtor-director');
const Debtor = mongoose.model('debtor');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  getApplicationList,
  deleteDraftApplication,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
  checkForAutomation,
  applicationDrawerDetails,
  submitApplication,
} = require('./../helper/application.helper');
const {
  getEntityDetailsByBusinessNumber,
  getEntityDetailsByName,
} = require('./../helper/abr.helper');
const {
  getDebtorFullAddress,
  getStateName,
  getStreetTypeName,
  getCurrentDebtorList,
} = require('./../helper/debtor.helper');
const StaticData = require('./../static-files/staticData.json');
const {
  getApplicationDocumentList,
  getSpecificEntityDocumentList,
} = require('./../helper/document.helper');
const { getAuditLogs, addAuditLog } = require('./../helper/audit-log.helper');
const { generateExcel } = require('../helper/excel.helper.js');
const {
  downloadDecisionLetterFromApplication,
} = require('./../helper/client-debtor.helper');

/**
 * Delete Draft application and its saved documents
 */
router.delete('/:applicationId', async function (req, res) {
  if (!req.params.applicationId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const application = await Application.findOne({
      _id: req.params.applicationId,
    });
    if (!application || (application && application?.status !== 'DRAFT')) {
      let message = !application
        ? 'Application not found.'
        : 'Application is not in draft.';
      Logger.log.error('Error occurred in deleting Draft application', message);
      res.status(404).send({
        status: 'ERROR',
        message: message,
      });
    } else {
      let response = await deleteDraftApplication(req.params.applicationId);
      res.status(200).send({
        status: 'SUCCESS',
        message: response,
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error occurred in deleting Draft application',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

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
    let module = StaticFile.modules.find((i) => i.name === req.query.columnFor);
    module = JSON.parse(JSON.stringify(module));
    module.manageColumns = module.manageColumns.filter(
      (data) => data.name !== 'clientId',
    );
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
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
      if (applicationColumn.columns.includes(module.manageColumns[i].name)) {
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
    Logger.log.error(
      'Error occurred in get application column names',
      e.message || e,
    );
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
    const debtors = await getCurrentDebtorList({
      showCompleteList: req.query?.isForFilter || true,
      isForRisk: false,
      userId: req.user.clientId,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        debtors: { field: 'debtorId', data: debtors },
        streetType: { field: 'streetType', data: StaticData.streetType },
        australianStates: { field: 'state', data: StaticData.australianStates },
        newZealandStates: { field: 'state', data: StaticData.newZealandStates },
        entityType: { field: 'entityType', data: StaticData.entityType },
        companyEntityType: {
          field: 'entityType',
          data: StaticData.companyEntityType,
        },
        applicationStatus: {
          field: 'applicationStatus',
          data: StaticData.applicationStatus,
        },
        countryList: { field: 'country', data: StaticData.countryList },
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
 * Get List
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'application');
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'application',
    );
    const response = await getApplicationList({
      hasFullAccess: false,
      applicationColumn: applicationColumn.columns,
      isForRisk: false,
      requestedQuery: req.query,
      moduleColumn: module.manageColumns,
      queryFilter: { clientId: mongoose.Types.ObjectId(req.user.clientId) },
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application list ', e);
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
    const module = StaticFile.modules.find((i) => i.name === 'application');
    const applicationColumn = [
      'applicationId',
      'status',
      'clientId',
      'debtorId',
      'entityType',
      'creditLimit',
      'acceptedAmount',
      'requestDate',
      'approvalOrDecliningDate',
      'expiryDate',
      'createdById',
      'outstandingAmount',
      'orderOnHand',
      'isExtendedPaymentTerms',
      'extendedPaymentTermsDetails',
      'isPassedOverdueAmount',
      'passedOverdueDetails',
      'createdAt',
      'updatedAt',
    ];

    const response = await getApplicationList({
      hasFullAccess: false,
      applicationColumn: applicationColumn,
      isForRisk: false,
      requestedQuery: req.query,
      moduleColumn: module.manageColumns,
      isForDownload: true,
      queryFilter: {
        status: { $ne: 'DRAFT' },
        clientId: mongoose.Types.ObjectId(req.user.clientId),
      },
    });
    const finalArray = [];
    let data = {};
    if (response && response?.docs.length > 20000) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOWNLOAD_LIMIT_EXCEED',
        message:
          'User cannot download more than 20000 applications at a time. Please apply filter to narrow down the list',
      });
    }
    if (response && response.docs.length !== 0) {
      response.docs.forEach((i) => {
        data = {};
        applicationColumn.map((key) => {
          if (key === 'clientId' || key === 'debtorId') {
            i[key] = i[key] && i[key]['value'] ? i[key]['value'] : '-';
          }
          data[key] = i[key];
        });
        finalArray.push(data);
      });
    }

    const excelData = await generateExcel({
      data: finalArray,
      reportFor: 'Application List',
      headers: response.headers,
      filter: response.filterArray,
    });
    const fileName = new Date().getTime() + '.xlsx';
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
    res.status(200).send(excelData);
  } catch (e) {
    Logger.log.error('Error occurred in export application list', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Application Modal details
 */
router.get('/drawer-details/:applicationId', async function (req, res) {
  if (
    !req.params.applicationId ||
    !mongoose.Types.ObjectId.isValid(req.params.applicationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'application');
    const application = await Application.findById(req.params.applicationId)
      .populate({
        path: 'clientId debtorId',
        select: 'name entityName entityType',
      })
      .select({
        __v: 0,
        applicationStage: 0,
      })
      .lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const response = await applicationDrawerDetails({
      application,
      manageColumns: module.manageColumns,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Application Details' },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get application modal details ',
      e.message || e,
    );
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
  '/download/decision-letter/:applicationId',
  async function (req, res) {
    try {
      const {
        bufferData,
        applicationNumber,
      } = await downloadDecisionLetterFromApplication({
        applicationId: req.params.applicationId,
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
      Logger.log.error('Error occurred in download in decision letter', e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Get Application Details
 */
router.get('/details/:applicationId', async function (req, res) {
  if (
    !req.params.applicationId ||
    !mongoose.Types.ObjectId.isValid(req.params.applicationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const application = await Application.findById(req.params.applicationId)
      .populate({
        path: 'clientId debtorId clientDebtorId',
        select: {
          __v: 0,
          isActive: 0,
          updatedAt: 0,
          debtorCode: 0,
          createdAt: 0,
        },
      })
      .select({ __v: 0, updatedAt: 0, createdAt: 0 })
      .lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const directors = await DebtorDirector.find({
      debtorId: application.debtorId,
      isDeleted: false,
    })
      .select({ createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    let response = {};
    response.status = {
      label: application.status
        .replace(/_/g, ' ')
        .replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }),
      value: application.status,
    };
    if (application.status === 'DRAFT') {
      response._id = application._id;
      response.applicationStage = application.applicationStage;
      response.company = {};
      if (application.clientId) {
        response.company.clientId = {
          value: application.clientId._id,
          label: application.clientId.name,
        };
      }
      if (application.debtorId) {
        response.company.debtorId = {
          value: application.debtorId._id,
          label: application.debtorId.entityName,
        };

        for (let key in application.debtorId) {
          response.company[key] = application.debtorId[key];
        }
        if (response.company.entityName) {
          response.company.entityName = {
            value: application.debtorId._id,
            label: response.company.entityName,
          };
        }
        if (response.company.entityType) {
          response.company.entityType = {
            value: response.company.entityType,
            label: response.company.entityType
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (txt) {
                return (
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                );
              }),
          };
        }
        for (let key in response.company.address) {
          response.company[key] = response.company.address[key];
        }
        if (response.company.state) {
          const state = await getStateName(
            response.company.state,
            response.company.country.code,
          );
          if (state && state.name && state._id) {
            response.company.state = {
              value: response.company.state,
              label: state && state.name ? state.name : response.company.state,
            };
          }
        }
        if (response.company.country) {
          response.company.country = {
            value: response.company.country.code,
            label: response.company.country.name,
          };
        }
        if (response.company.streetType) {
          response.company.streetType = await getStreetTypeName(
            response.company.streetType,
          );
        }
        delete response.company.address;
      }
      if (application.creditLimit) {
        response.creditLimit = {
          creditLimit: application.creditLimit,
          isExtendedPaymentTerms: application.isExtendedPaymentTerms,
          extendedPaymentTermsDetails: application.extendedPaymentTermsDetails,
          isPassedOverdueAmount: application.isPassedOverdueAmount,
          passedOverdueDetails: application.passedOverdueDetails,
          note: application.note,
          outstandingAmount: application.outstandingAmount,
          orderOnHand: application.orderOnHand,
        };
      }
      if (directors && directors.length !== 0) {
        response.partners = directors;
        response.partners.forEach((partner) => {
          partner.isDisabled = true;
          if (partner.type === 'individual') {
            if (partner.title) {
              partner.title = {
                value: partner.title,
                label: partner.title,
              };
            }
            for (let key in partner.residentialAddress) {
              partner[key] = partner.residentialAddress[key];
            }
            if (partner.state) {
              const state = getStateName(partner.state, partner.country.code);
              if (state && state.name && state._id) {
                partner.state = {
                  value: partner.state,
                  label: state && state.name ? state.name : partner.state,
                };
              }
            }
            if (partner.streetType) {
              partner.streetType = getStreetTypeName(partner.streetType);
            }
            if (partner.country) {
              partner.country = {
                value: partner.country.code,
                label: partner.country.name,
              };
            }
            delete partner.residentialAddress;
          } else {
            if (partner.entityName) {
              partner.entityName = {
                value: application.debtorId._id,
                label: partner.entityName,
              };
            }
            if (partner.entityType) {
              partner.entityType = {
                value: partner.entityType,
                label:
                  partner.entityType.charAt(0).toUpperCase() +
                  partner.entityType.slice(1).toLowerCase(),
              };
            }
            if (partner.country) {
              partner.stakeholderCountry = {
                value: partner.country.code,
                label: partner.country.name,
              };
            }
          }
        });
      }
      response.documents = await getApplicationDocumentList({
        entityId: application._id,
      });
    } else {
      response.applicationId = application.applicationId;
      response.isAllowToUpdate =
        req.user.maxCreditLimit >= application.creditLimit;
      if (application.clientId) {
        response.clientId = [
          {
            _id: application.clientId._id,
            value: application.clientId.name,
          },
        ];
      }
      if (application.debtorId) {
        response.debtorId = [
          {
            _id: application.debtorId._id,
            value: application.debtorId.entityName,
          },
        ];
        for (let key in application.debtorId) {
          if (key === 'address') {
            response.country = application.debtorId.address.country.code;
            response[key] = getDebtorFullAddress({
              address: application.debtorId[key],
              country: application.debtorId[key]['country'],
            });
          } else {
            response[key] = application.debtorId[key];
          }
        }
        if (response.entityType) {
          response.entityType = response.entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            });
        }
      }
      if (application.clientDebtorId) {
        response.outstandingAmount =
          application.clientDebtorId.outstandingAmount;
        response.clientDebtorId = application.clientDebtorId._id;
      }
      response.creditLimit = application.creditLimit;
      response.isExtendedPaymentTerms = application.isExtendedPaymentTerms;
      response.extendedPaymentTermsDetails =
        application.extendedPaymentTermsDetails;
      response.isPassedOverdueAmount = application.isPassedOverdueAmount;
      response.passedOverdueDetails = application.passedOverdueDetails;
      response.orderOnHand = application.orderOnHand;
      response.outstandingAmount = application.outstandingAmount;
      response.clientReference = application.clientReference;
      response.limitType = application.limitType;
      response.expiryDate = application.expiryDate;
      // response.note = application.note;
      const status = ['DRAFT', 'APPROVED', 'DECLINED'];
      response.applicationStatus = StaticData.applicationStatus.filter(
        (data) => !status.includes(data.value),
      );
      response.headers = [
        {
          name: 'clientId',
          label: 'Client Name',
          type: 'modal',
          request: { method: 'GET', url: 'client/details' },
        },
        {
          name: 'debtorId',
          label: 'Debtor Name',
          type: 'modal',
          request: { method: 'GET', url: 'debtor/drawer' },
        },
      ];
      response._id = application._id;
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application details ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//TODO add for reports + alerts
router.get('/modules/:applicationId', async function (req, res) {
  if (
    !req.params.applicationId ||
    !mongoose.Types.ObjectId.isValid(req.params.applicationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const application = await Application.findById(
      req.params.applicationId,
    ).lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const response = {};
    response.documents = await getSpecificEntityDocumentList({
      entityId: application._id,
      clientId: application.clientId,
    });
    response.logs = await getAuditLogs({ entityId: application._id });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get application modules data ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Search from ABN/ACN Number
 */
router.get('/search-entity', async function (req, res) {
  if (!req.query.searchString || !req.query.country || !req.query.step) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await Debtor.findOne({
      $or: [{ abn: req.query.searchString }, { acn: req.query.searchString }],
    }).lean();
    let responseData = {};
    if (debtor) {
      const application = await Application.findOne({
        clientId: req.user.clientId,
        debtorId: debtor._id,
        status: {
          $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
        },
      }).lean();
      let anotherApplication;
      if (application && application?._id) {
        anotherApplication = await Application.findOne({
          _id: { $ne: application._id },
          clientId: req.user.clientId,
          debtorId: debtor._id,
          status: {
            $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
          },
        });
      }
      if (
        application &&
        application.status !== 'APPROVED' &&
        anotherApplication
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message:
            'Application already exists, please create with another debtor',
        });
      } else if (application && application.status === 'APPROVED') {
        responseData.message =
          'You already have one approved application, do you still want to create another one?';
        responseData.messageCode = 'APPROVED_APPLICATION_ALREADY_EXISTS';
      }
    }
    const response = await getEntityDetailsByBusinessNumber({
      country: req.query.country,
      searchString: req.query.searchString,
      step: req.query.step,
    });
    if (response && response.status && response.status === 'ERROR') {
      return res.status(400).send(response);
    }
    responseData.status = 'SUCCESS';
    responseData.data = response;
    res.status(200).send(responseData);
  } catch (e) {
    Logger.log.error('Error occurred in search by business number', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Search from Entity Name
 */
router.get('/search-entity-list', async function (req, res) {
  if (!req.query.searchString || !req.query.country || !req.query.step) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const response = await getEntityDetailsByName({
      searchString: req.query.searchString,
      country: req.query.country,
      page: req.query.page,
      step: req.query.step,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in search by entity name', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Specific Entity's Application
 */
router.get('/:entityId', async function (req, res) {
  if (
    !req.params.entityId ||
    !req.query.listFor ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const queryFilter = {
      isDeleted: false,
    };
    switch (req.query.listFor) {
      case 'debtor-application':
        queryFilter.debtorId = mongoose.Types.ObjectId(req.params.entityId);
        queryFilter.clientId = mongoose.Types.ObjectId(req.user.clientId);
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const module = StaticFile.modules.find((i) => i.name === req.query.listFor);
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.listFor,
    );
    const response = await getApplicationList({
      hasFullAccess: false,
      applicationColumn: applicationColumn.columns,
      isForRisk: false,
      requestedQuery: req.query,
      queryFilter: queryFilter,
      moduleColumn: module.manageColumns,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while getting specific entity applications ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Specific Entity's Application
 */
router.get('/download/:entityId', async function (req, res) {
  if (
    !req.params.entityId ||
    !req.query.listFor ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const queryFilter = {
      isDeleted: false,
    };
    switch (req.query.listFor) {
      case 'debtor-application':
        queryFilter.debtorId = mongoose.Types.ObjectId(req.params.entityId);
        queryFilter.clientId = mongoose.Types.ObjectId(req.user.clientId);
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const module = StaticFile.modules.find((i) => i.name === req.query.listFor);
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.listFor,
    );
    const response = await getApplicationList({
      hasFullAccess: false,
      applicationColumn: applicationColumn.columns,
      isForRisk: false,
      requestedQuery: req.query,
      queryFilter: queryFilter,
      moduleColumn: module.manageColumns,
    });
    const excelData = await generateExcel({
      data: response.docs,
      reportFor: 'Application List',
      headers: response.headers,
      filter: response.filterArray,
    });
    const fileName = new Date().getTime() + '.xlsx';
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
    res.status(200).send(excelData);
  } catch (e) {
    Logger.log.error(
      'Error occurred while downloading specific entity applications ',
      e.message || e,
    );
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
    let updateColumns = [];
    let module;
    switch (req.body.columnFor) {
      case 'application':
      case 'debtor-application':
        if (req.body.isReset) {
          module = StaticFile.modules.find(
            (i) => i.name === req.body.columnFor,
          );
          module = JSON.parse(JSON.stringify(module));
          module.defaultColumns = module.defaultColumns.filter(
            (data) => data !== 'clientId',
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
    await ClientUser.updateOne(
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
 * Generate Application
 */
router.put('/', async function (req, res) {
  if (!req.body.stepper) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper !== 'company' &&
    (!req.body.applicationId ||
      !mongoose.Types.ObjectId.isValid(req.body.applicationId))
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper === 'company' &&
    (!req.body.address ||
      !req.body.address.country ||
      !req.body.entityType ||
      (req.body.entityType === 'TRUST' &&
        (!req.body.address.state || !req.body.address.postCode)) ||
      (!req.body.abn && !req.body.acn && !req.body.registrationNumber) ||
      !req.body.entityName)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper === 'person' &&
    (!req.body.entityType ||
      !req.body.partners ||
      req.body.partners.length === 0)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper === 'credit-limit' &&
    (!req.body.creditLimit ||
      !req.body.hasOwnProperty('isPassedOverdueAmount') ||
      !req.body.hasOwnProperty('isExtendedPaymentTerms'))
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let response;
    let message;
    switch (req.body.stepper) {
      case 'company':
        response = await storeCompanyDetails({
          requestBody: req.body,
          createdByType: 'client-user',
          createdBy: req.user.clientId,
          createdByName: req.user.name,
          clientId: req.user.clientId,
        });
        break;
      case 'person':
        response = await storePartnerDetails({ requestBody: req.body });
        break;
      case 'credit-limit':
        response = await storeCreditLimitDetails({
          requestBody: req.body,
        });
        break;
      case 'documents':
        response = await Application.findById(req.body.applicationId)
          .populate({ path: 'debtorId', select: 'entityType' })
          .select('_id applicationStage debtorId')
          .lean();
        const entityTypes = ['TRUST', 'PARTNERSHIP'];
        const applicationStage = !entityTypes.includes(
          response.debtorId.entityType,
        )
          ? 3
          : 4;
        await Application.updateOne(
          { _id: req.body.applicationId },
          { applicationStage: applicationStage },
        );
        response = await Application.findById(req.body.applicationId)
          .select('_id applicationStage')
          .lean();
        break;
      case 'confirmation':
        message = await submitApplication({
          applicationId: req.body.applicationId,
          userId: req.user.clientId,
          userType: 'client-user',
        });
        checkForAutomation({
          applicationId: req.body.applicationId,
          userId: req.user.clientId,
          userType: 'client-user',
        });
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    if (response && response.status && response.status === 'ERROR') {
      return res.status(400).send(response);
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: message,
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in generating application ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e,
    });
  }
});

/**
 * Update Application
 */
router.put('/:applicationId', async function (req, res) {
  if (
    !req.params.applicationId ||
    !mongoose.Types.ObjectId.isValid(req.params.applicationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const application = await Application.findOne({
      _id: req.params.applicationId,
    })
      .populate({ path: 'clientId', select: '_id name' })
      .lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const applicationUpdate = {};
    if (req.body.clientReference) {
      applicationUpdate.clientReference = req.body.clientReference;
    }
    //TODO notify user
    await Application.updateOne(
      { _id: req.params.applicationId },
      applicationUpdate,
    );
    await addAuditLog({
      entityType: 'application',
      entityRefId: application._id,
      actionType: 'edit',
      userType: 'user',
      userRefId: req.user.clientId,
      logDescription: `An application ${application.applicationId} is updated by ${application.clientId?.name}`,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Application updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in generating application ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e,
    });
  }
});

/**
 * Export Router
 */
module.exports = router;
