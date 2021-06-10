/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const Application = mongoose.model('application');
const ClientDebtor = mongoose.model('client-debtor');
const Policy = mongoose.model('policy');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  getApplicationList,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
  checkForAutomation,
} = require('./../helper/application.helper');
const {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getEntityListByName,
  resolveEntityType,
} = require('./../helper/abr.helper');
const { getClientList } = require('./../helper/client.helper');
const {
  getDebtorList,
  getDebtorFullAddress,
  getStateName,
  getStreetTypeName,
} = require('./../helper/debtor.helper');
const StaticData = require('./../static-files/staticData.json');
const { getClientDebtorDetails } = require('./../helper/client-debtor.helper');
const {
  getApplicationDocumentList,
  getSpecificEntityDocumentList,
} = require('./../helper/document.helper');
const { getAuditLogs, addAuditLog } = require('./../helper/audit-log.helper');
const { addNote } = require('./../helper/note.helper');

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
      (i) => i.name === req.query.columnFor,
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
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const [clients, debtors] = await Promise.all([
      getClientList({ hasFullAccess: hasFullAccess, userId: req.user._id }),
      getDebtorList(),
    ]);
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        clients: { field: 'clientId', data: clients },
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
    let clientIds;
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
      const clients = await Client.find({
        isDeleted: false,
        $or: [
          { riskAnalystId: req.user._id },
          { serviceManagerId: req.user._id },
        ],
      })
        .select({ _id: 1 })
        .lean();
      clientIds = clients.map((i) => i._id);
    }

    const response = await getApplicationList({
      hasFullAccess: hasFullAccess,
      applicationColumn: applicationColumn.columns,
      isForRisk: true,
      requestedQuery: req.query,
      clientIds: clientIds,
      moduleColumn: module.manageColumns,
      userId: req.user._id,
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
    const debtor = StaticFile.modules.find((i) => i.name === 'debtor');
    const application = await Application.findById(req.params.applicationId)
      .populate({
        path: 'clientId debtorId clientDebtorId',
        select: {
          __v: 0,
          updatedAt: 0,
          debtorCode: 0,
          createdAt: 0,
        },
      })
      .select({
        __v: 0,
        updatedAt: 0,
        createdAt: 0,
        createdById: 0,
        createdByType: 0,
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
    const debtorDetails = await getClientDebtorDetails({
      debtor: application,
      manageColumns: debtor.manageColumns,
    });
    let response = [];
    let value = '';
    module.manageColumns.forEach((i) => {
      value =
        i.name === 'clientId'
          ? application['clientId'][i.name]
          : i.name === 'outstandingAmount'
          ? application['clientDebtorId'][i.name]
          : i.name === 'isExtendedPaymentTerms' ||
            i.name === 'isPassedOverdueAmount'
          ? application[i.name]
            ? 'Yes'
            : 'No'
          : application[i.name];
      if (i.name === 'status') {
        value = value.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
      }
      if (typeof value === 'string') {
        response.push({
          label: i.label,
          value: value || '',
          type: i.type,
        });
      }
    });
    response = response.concat(debtorDetails);
    res.status(200).send({ status: 'SUCCESS', data: response });
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
                response.company.state = {
                  value: response.company.state,
                  label:
                    state && state.name ? state.name : response.company.state,
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
                label: partner.entityType
                  .replace(/_/g, ' ')
                  .replace(/\w\S*/g, function (txt) {
                    return (
                      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                    );
                  }),
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
      if (!response.isAllowToUpdate) {
        response.message =
          "You don't have access to approve application.Please contact admin for that";
      }
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
        application.outstandingAmount =
          application.clientDebtorId.outstandingAmount;
      }
      response.creditLimit = application.creditLimit;
      response.isExtendedPaymentTerms = application.isExtendedPaymentTerms;
      response.extendedPaymentTermsDetails =
        application.extendedPaymentTermsDetails;
      response.isPassedOverdueAmount = application.isPassedOverdueAmount;
      response.passedOverdueDetails = application.passedOverdueDetails;
      response.orderOnHand = application.orderOnHand;
      response.outstandingAmount = application.outstandingAmount;
      // response.note = application.note;
      const status = ['DRAFT', 'APPROVED', 'DECLINED'];
      response.applicationStatus = StaticData.applicationStatus.filter(
        (data) => !status.includes(data.value),
      );
      response.blockers = application.blockers;
      response._id = application._id;
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
      userId: req.user._id,
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
  if (!req.query.searchString || !req.query.clientId) {
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
        clientId: req.query.clientId,
        debtorId: debtor._id,
        status: {
          $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
        },
      }).lean();
      if (application && application.status !== 'APPROVED') {
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
    let entityData;
    if (req.query.searchString.length < 10) {
      console.log('Get entity details from ACN number :: ');
      entityData = await getEntityDetailsByACN({
        searchString: req.query.searchString,
      });
    } else {
      entityData = await getEntityDetailsByABN({
        searchString: req.query.searchString,
      });
    }
    let response = {};
    if (entityData && entityData.response) {
      const entityDetails =
        entityData.response.businessEntity202001 ||
        entityData.response.businessEntity201408;
      if (entityDetails) {
        if (entityDetails.ABN) response.abn = entityDetails.ABN.identifierValue;
        if (
          entityDetails.entityStatus &&
          entityDetails.entityStatus.entityStatusCode
        )
          response.isActive = entityDetails.entityStatus.entityStatusCode;
        if (
          entityDetails.entityStatus &&
          entityDetails.entityStatus.effectiveFrom
        )
          response.registeredDate = entityDetails.entityStatus.effectiveFrom;
        if (entityDetails.ASICNumber)
          response.acn =
            typeof entityDetails.ASICNumber === 'string'
              ? entityDetails.ASICNumber
              : '';
        if (entityDetails.entityType) {
          const entityType = await resolveEntityType({
            entityType: entityDetails.entityType.entityDescription,
          });
          response.entityType = {
            label: entityType
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (txt) {
                return (
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                );
              }),
            value: entityType,
          };
        }
        if (entityDetails.goodsAndServicesTax)
          response.gstStatus = entityDetails.goodsAndServicesTax.effectiveFrom;
        if (entityDetails.mainName)
          response.entityName = {
            label: Array.isArray(entityDetails.mainName)
              ? entityDetails.mainName[0].organisationName
              : entityDetails.mainName.organisationName,
            value: Array.isArray(entityDetails.mainName)
              ? entityDetails.mainName[0].organisationName
              : entityDetails.mainName.organisationName,
          };
        const tradingName =
          entityDetails.mainTradingName || entityDetails.businessName;
        if (tradingName)
          response.tradingName =
            tradingName.organisationName ||
            typeof tradingName.organisationName === 'string'
              ? tradingName.organisationName
              : tradingName[0].organisationName;
        if (entityDetails.mainBusinessPhysicalAddress[0]) {
          const state = StaticData.australianStates.find((i) => {
            if (
              i._id === entityDetails.mainBusinessPhysicalAddress[0].stateCode
            )
              return i;
          });
          response.state = {
            label:
              state && state.name
                ? state.name
                : entityDetails.mainBusinessPhysicalAddress[0].stateCode,
            value: entityDetails.mainBusinessPhysicalAddress[0].stateCode,
          };
        }
        if (entityDetails.mainBusinessPhysicalAddress[0])
          response.postCode =
            entityDetails.mainBusinessPhysicalAddress[0].postcode;
      } else {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'NO_DATA_FOUND',
          message: 'No data found',
        });
      }
    }
    responseData.status = 'SUCCESS';
    responseData.data = response;
    res.status(200).send(responseData);
  } catch (e) {
    Logger.log.error('Error occurred in search by ABN number  ', e);
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
  if (!req.query.searchString) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let entityList = await getEntityListByName({
      searchString: req.query.searchString,
    });
    let response = [];
    let entityData = {};
    if (
      entityList &&
      entityList.ABRPayloadSearchResults.response &&
      entityList.ABRPayloadSearchResults.response.searchResultsList &&
      entityList.ABRPayloadSearchResults.response.searchResultsList
        .searchResultsRecord &&
      entityList.ABRPayloadSearchResults.response.searchResultsList
        .searchResultsRecord.length !== 0
    ) {
      const entities = Array.isArray(
        entityList.ABRPayloadSearchResults.response.searchResultsList
          .searchResultsRecord,
      )
        ? entityList.ABRPayloadSearchResults.response.searchResultsList
            .searchResultsRecord
        : [
            entityList.ABRPayloadSearchResults.response.searchResultsList
              .searchResultsRecord,
          ];
      entities.forEach((data) => {
        entityData = {};
        if (
          data.ABN &&
          data.ABN.identifierStatus &&
          data.ABN.identifierStatus.toLowerCase() !== 'cancelled'
        ) {
          if (data.ABN) entityData.abn = data.ABN.identifierValue;
          if (data.ABN) entityData.status = data.ABN.identifierStatus;
          let fieldName =
            data.mainName ||
            data.businessName ||
            data.otherTradingName ||
            data.mainTradingName;
          if (fieldName) {
            entityData.label = fieldName.organisationName;
            entityData.value = fieldName.organisationName;
          }
          if (data.mainBusinessPhysicalAddress) {
            entityData.state =
              typeof data.mainBusinessPhysicalAddress.stateCode === 'string'
                ? data.mainBusinessPhysicalAddress.stateCode
                : '';
            entityData.postCode = data.mainBusinessPhysicalAddress.postcode;
          }
          response.push(entityData);
        }
      });
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in search by ABN number  ', e);
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
    let queryFilter = {
      isDeleted: false,
    };
    switch (req.query.listFor) {
      case 'client-application':
        queryFilter.clientId = mongoose.Types.ObjectId(req.params.entityId);
        break;
      case 'debtor-application':
        queryFilter.debtorId = mongoose.Types.ObjectId(req.params.entityId);
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
      isForRisk: true,
      requestedQuery: req.query,
      queryFilter: queryFilter,
      moduleColumn: module.manageColumns,
      userId: req.user._id,
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
      case 'client-application':
      case 'debtor-application':
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
    (!req.body.clientId ||
      !req.body.address ||
      !req.body.address.state ||
      !req.body.address.country ||
      !req.body.address.postCode ||
      !req.body.entityType ||
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
          createdByType: 'user',
          createdBy: req.user._id,
          createdByName: req.user.name,
          clientId: req.body.clientId,
        });
        break;
      case 'person':
        response = await storePartnerDetails({ requestBody: req.body });
        break;
      case 'credit-limit':
        response = await storeCreditLimitDetails({
          requestBody: req.body,
          createdByType: 'user',
          createdBy: req.user._id,
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
        let application = await Application.findOne({
          _id: req.body.applicationId,
        }).lean();
        const applicationData = await Application.findOne({
          debtorId: application.debtorId,
          clientId: application.clientId,
          status: {
            $nin: [
              'DECLINED',
              'CANCELLED',
              'WITHDRAWN',
              'SURRENDERED',
              'DRAFT',
              'APPROVED',
            ],
          },
        }).lean();
        if (applicationData) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'APPLICATION_ALREADY_EXISTS',
            message: 'Application already exists',
          });
        }
        await Application.updateOne(
          { _id: req.body.applicationId },
          { $set: { status: 'SUBMITTED', $inc: { applicationStage: 1 } } },
        );
        message = 'Application submitted successfully.';
        await addAuditLog({
          entityType: 'application',
          entityRefId: application._id,
          actionType: 'add',
          userType: 'user',
          userRefId: req.user._id,
          logDescription: `A new application ${application.applicationId} is successfully generated by ${req.user.name}`,
        });
        checkForAutomation({ applicationId: req.body.applicationId });
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
    Logger.log.error(
      'Error occurred in generating application ',
      e.message || e,
    );
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
    !mongoose.Types.ObjectId.isValid(req.params.applicationId) ||
    !req.body.status
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
    }).lean();
    if (req.body.status === 'APPROVED') {
      if (!req.body.creditLimit || !/^\d+$/.test(req.body.creditLimit)) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing',
        });
      }
      const applicationData = await Application.findOne({
        clientId: application.clientId,
        debtorId: application.debtorId,
        clientDebtorId: application.clientDebtorId,
        status: 'APPROVED',
      }).lean();
      req.body.creditLimit = parseInt(req.body.creditLimit);
      const ciPolicy = await Policy.findOne({
        clientId: application.clientId,
        product: { $regex: '.*Credit Insurance.*' },
        inceptionDate: { $lte: new Date() },
        expiryDate: { $gt: new Date() },
      })
        .select(
          'clientId product policyPeriod discretionaryLimit inceptionDate expiryDate',
        )
        .lean();
      const update = {
        creditLimit: req.body.creditLimit,
        isEndorsedLimit: false,
        activeApplicationId: application._id,
      };
      if (
        ciPolicy &&
        ciPolicy.discretionaryLimit &&
        ciPolicy.discretionaryLimit < req.body.creditLimit
      ) {
        update.isEndorsedLimit = true;
      }
      await ClientDebtor.updateOne({ _id: application.clientDebtorId }, update);
      if (applicationData && applicationData._id) {
        await Application.updateOne(
          { _id: applicationData._id },
          { status: 'SURRENDERED' },
        );
      }
    } else if (
      req.body.status === 'DECLINED' ||
      req.body.status === 'CANCELLED' ||
      req.body.status === 'WITHDRAWN' ||
      req.body.status === 'SURRENDERED'
    ) {
      if (req.body.description && req.body.hasOwnProperty('isPublic')) {
        await addNote({
          userId: req.user._id,
          entityId: req.params.applicationId,
          description: req.body.description,
          userType: 'user',
          userName: req.user.name,
          isPublic: req.body.isPublic,
          noteFor: 'application',
        });
      }
      await ClientDebtor.updateOne(
        { _id: req.params.debtorId },
        {
          creditLimit: undefined,
          activeApplicationId: undefined,
          isActive: false,
        },
      );
    }
    //TODO notify user
    await Application.updateOne(
      { _id: req.params.applicationId },
      { status: req.body.status },
    );
    await addAuditLog({
      entityType: 'application',
      entityRefId: application._id,
      actionType: 'edit',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: `An application ${application.applicationId} is updated by ${req.user.name}`,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Application status updated successfully',
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
 * Delete Application
 */
router.delete('/:applicationId', async function (req, res) {
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
    await Application.updateOne(
      { _id: req.params.applicationId },
      { isDeleted: true },
    );
    const application = await Application.findById(
      req.params.applicationId,
    ).lean();
    await addAuditLog({
      entityType: 'application',
      entityRefId: application._id,
      actionType: 'delete',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: `Application ${application.applicationId} is successfully deleted by ${req.user.name}`,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Application deleted successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete application ', e.message || e);
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
