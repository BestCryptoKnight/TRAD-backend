/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const Application = mongoose.model('application');

const { Parser } = require('json2csv');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');
const {
  getClientDebtorDetails,
  getClientCreditLimit,
  getDebtorCreditLimit,
  downloadDecisionLetter,
} = require('./../helper/client-debtor.helper');
const {
  getDebtorFullAddress,
  getCurrentDebtorList,
  getClientDebtorList,
  checkForRegistrationNumber,
  storeCompanyDetails,
  submitDebtor,
} = require('./../helper/debtor.helper');
const {
  generateNewApplication,
  checkForPendingApplication,
} = require('./../helper/application.helper');
const {
  getStakeholderList,
  getStakeholderDetails,
} = require('./../helper/stakeholder.helper');
const {
  listEntitySpecificAlerts,
  checkForEntityInProfile,
  checkForActiveCreditLimit,
} = require('./../helper/alert.helper');
const {
  getApplicationDocumentList,
  getSpecificEntityDocumentList,
} = require('./../helper/document.helper');
const { generateExcel } = require('./../helper/excel.helper');
const { addAuditLog } = require('./../helper/audit-log.helper');

const {
  getDebtorList,
  getDebtorDirectorList,
} = require('./../helper/globalSearch.helper');

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
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    const customFields = [];
    const defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
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
      'Error occurred in get debtor column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Entity Type List
 * */
router.get('/entity-list', async function (req, res) {
  try {
    const debtors = await getCurrentDebtorList({
      showCompleteList: false,
      isForRisk: false,
      userId: req.user.clientId,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        streetType: { field: 'streetType', data: StaticData.streetType },
        australianStates: { field: 'state', data: StaticData.australianStates },
        newZealandStates: { field: 'state', data: StaticData.newZealandStates },
        entityType: { field: 'entityType', data: StaticData.entityType },
        countryList: { field: 'country', data: StaticData.countryList },
        debtors: { field: 'debtor', data: debtors },
        // streetType: StaticData.streetType,
        // australianStates: StaticData.australianStates,
        // entityType: StaticData.entityType,
        // newZealandStates: StaticData.newZealandStates,
        // countryList: StaticData.countryList,
        // debtors,
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get entity type list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtors List
 * */
router.get('/global', async function (req, res) {
  if (!req.query.searchString) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const [debtors, debtorDirector] = await Promise.all([
      getDebtorList({
        searchString: req.query.searchString,
      }),
      getDebtorDirectorList({
        searchString: req.query.searchString,
      }),
    ]);
    let response = debtors.concat(debtorDirector);
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in global risk panel search',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor list
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor',
    );
    const response = await getClientDebtorList({
      requestedQuery: req.query,
      debtorColumn: debtorColumn.columns,
      clientId: req.user.clientId,
      moduleColumn: module.manageColumns,
      isForRisk: false,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get client-debtor details ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Generate Company Registration Number
 */
router.get('/generate/registration-number', async function (req, res) {
  try {
    const registrationNumber = await checkForRegistrationNumber();
    res.status(200).send({
      status: 'SUCCESS',
      data: registrationNumber,
    });
  } catch (e) {
    Logger.log.error('Error occurred in generate registration number ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Stakeholder drawer details
 */
router.get(
  '/stakeholder/drawer-details/:stakeholderId',
  async function (req, res) {
    if (
      !req.params.stakeholderId ||
      !mongoose.Types.ObjectId.isValid(req.params.stakeholderId)
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    try {
      let module = StaticFile.modules.find((i) => i.name === 'stakeholder');
      module = JSON.parse(JSON.stringify(module));
      const response = await getStakeholderDetails({
        stakeholderId: req.params.stakeholderId,
        manageColumns: module.manageColumns,
      });
      if (response && response.status && response.status === 'ERROR') {
        return res.status(400).send(response);
      }
      res.status(200).send({
        status: 'SUCCESS',
        data: { response, header: 'Stakeholder Details' },
      });
    } catch (e) {
      Logger.log.error(
        'Error occurred in get stakeholder modal details ',
        e.message || e,
      );
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Get StakeHolder List
 */
router.get('/stakeholder/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
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
      debtorId: req.params.debtorId,
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
 * Get Debtor Modal details
 */
router.get('/drawer/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let module = StaticFile.modules.find((i) => i.name === 'debtor');
    module = JSON.parse(JSON.stringify(module));
    const debtor = await Debtor.findOne({
      _id: req.params.debtorId,
    })
      .select({ _id: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 })
      .lean();
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
    const response = await getClientDebtorDetails({
      debtor: { debtorId: debtor },
      manageColumns: module.manageColumns,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Debtor Details' },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get debtor modal details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor Details
 */
router.get('/details/:debtorId', async function (req, res) {
  if (!req.params.debtorId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let responseData = {};
    const application = await Application.findOne({
      debtorId: req.params.debtorId,
      clientId: req.user.clientId,
      status: {
        $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
      },
    }).lean();
    let anotherApplication;
    if (application) {
      anotherApplication = await Application.findOne({
        _id: { $ne: application._id },
        debtorId: req.params.debtorId,
        clientId: req.user.clientId,
        status: {
          $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
        },
      });
    }
    if (
      application &&
      ((!anotherApplication &&
        application.status !== 'APPROVED' &&
        application.status !== 'DRAFT') ||
        (anotherApplication && application.status !== 'APPROVED'))
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'APPLICATION_ALREADY_EXISTS',
        message:
          'Application already exists, please create with another debtor',
      });
    } else if (application && application.status === 'APPROVED') {
      const otherApplication = await Application.findOne({
        debtorId: req.params.debtorId,
        clientId: req.user.clientId,
        status: {
          $nin: [
            'DECLINED',
            'CANCELLED',
            'WITHDRAWN',
            'SURRENDERED',
            'APPROVED',
          ],
        },
      }).lean();
      if (otherApplication) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message:
            'Application already exists, please create with another debtor',
        });
      }
      responseData.message =
        'You already have one approved application, do you still want to create another one?';
      responseData.messageCode = 'APPROVED_APPLICATION_ALREADY_EXISTS';
    }
    var clientDebtor = await ClientDebtor.findOne({
      _id: req.params.debtorId,
    });

    if (clientDebtor?.debtorId == undefined) {
      clientDebtor = {
        debtorId: req.params.debtorId,
      };
    }
    const debtor = await Debtor.findById(clientDebtor.debtorId)
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    if (debtor) {
      if (debtor.address) {
        for (let key in debtor.address) {
          debtor[key] = debtor.address[key];
        }
        delete debtor.address;
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
    responseData.status = 'SUCCESS';
    responseData.data = {
      company: debtor,
      debtorStage: debtor.debtorStage,
      _id: debtor._id,
      entityType: debtor.entityType,
      documents: {
        uploadDocumentDebtorData: await getApplicationDocumentList({
          entityId: debtor._id,
        }),
      },
    };
    res.status(200).send(responseData);
  } catch (e) {
    Logger.log.error('Error occurred in get debtor details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Debtor in Excel
 */
router.get('/download', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtorColumn = [
      'debtorCode',
      'entityName',
      'abn',
      'acn',
      'registrationNumber',
      'tradingName',
      'entityType',
      'fullAddress',
      'property',
      'unitNumber',
      'streetNumber',
      'streetName',
      'streetType',
      'suburb',
      'state',
      'country',
      'postCode',
      'contactNumber',
      'riskRating',
      'reviewDate',
      'isActive',
      'createdAt',
      'updatedAt',
    ];
    const response = await getClientDebtorList({
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
      const headers = [];
      for (let i = 0; i < module.manageColumns.length; i++) {
        if (debtorColumn.includes(module.manageColumns[i].name)) {
          headers.push(module.manageColumns[i]);
        }
      }
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
        reportFor: 'Debtor List',
        headers,
        filter: response.filterArray,
      });
      res.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const fileName = client?.clientCode + '-debtor-' + Date.now() + '.xlsx';
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      res.status(200).send(excelData);
    } else {
      res.status(400).send({
        status: 'ERROR',
        message: 'No data found for download file',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in download debtors in csv', e);
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
      Logger.log.error('Error occurred in download decision letter in csv', e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Get Debtor Details
 */
router.get('/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await Debtor.findById(req.params.debtorId)
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
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
    if (debtor.address) {
      for (let key in debtor.address) {
        debtor[key] = debtor.address[key];
      }
      if (debtor.state) {
        const state =
          debtor.country.code === 'AUS'
            ? StaticData.australianStates.find((i) => {
                if (i._id === debtor.state) return i;
              })
            : debtor.country.code === 'NZL'
            ? StaticData.newZealandStates.find((i) => {
                if (i._id === debtor.state) return i;
              })
            : { name: debtor.state };
        debtor.state = {
          value: debtor.state,
          label: state && state.name ? state.name : debtor.state,
        };
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
      if (debtor.country) {
        debtor.country = {
          label: debtor.country.name,
          value: debtor.country.code,
        };
      }
      delete debtor.address;
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: debtor,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Credit Limit Lists
 */
router.get('/credit-limit/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === 'debtor-credit-limit',
    );
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor-credit-limit',
    );
    const hasOnlyReadAccessForApplicationModule = false;

    const hasOnlyReadAccessForClientModule = false;

    const hasFullAccessForClientModule = true;

    const response = await getDebtorCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn.columns,
      moduleColumn: module.manageColumns,
      debtorId: req.params.debtorId,
      hasOnlyReadAccessForApplicationModule,
      hasOnlyReadAccessForClientModule,
      hasFullAccessForClientModule,
      userId: null,
      clientId: req.user.clientId,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor details ',
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
      case 'debtor':
      case 'credit-limit':
      case 'debtor-credit-limit':
      case 'stakeholder':
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
 * Get Alert List
 */
router.get('/alert-list/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const alertColumn = [
      'alertType',
      'alertCategory',
      'alertPriority',
      'createdAt',
    ];
    const response = await listEntitySpecificAlerts({
      debtorId: req.params.debtorId,
      requestedQuery: req.query,
      alertColumn,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get alert list', e);
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
          message: `Application already exists for Debtor: ${clientDebtor?.debtorId?.entityName}`,
        });
      }
      await addAuditLog({
        entityType: 'credit-limit',
        entityRefId: req.params.creditLimitId,
        actionType: 'edit',
        userType: 'client-user',
        userRefId: req.user.clientId,
        logDescription: `A credit limit of ${clientDebtor?.clientId?.name} ${clientDebtor?.debtorId?.entityName} is modified by ${clientDebtor?.clientId?.name}`,
      });
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdById: req.user.clientId,
        createdByType: 'client-user',
        creditLimit: req.body.creditLimit,
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
    Logger.log.error('Error occurred in update credit-limit', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Generate New Debtor
 */

router.put('/generate', async function (req, res) {
  if (!req.body.stepper) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  // if (
  //   req.body.stepper !== 'company'
  //   && (!req.body.applicationId ||
  //     !mongoose.Types.ObjectId.isValid(req.body.applicationId))
  // ) {
  //   return res.status(400).send({
  //     status: 'ERROR',
  //     messageCode: 'REQUIRE_FIELD_MISSING',
  //     message: 'Require fields are missing.',
  //   });
  // }
  if (
    req.body.stepper === 'company' &&
    // !req.body.clientId ||
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
  try {
    let response;
    let message;
    switch (req.body.stepper) {
      case 'company':
        response = await storeCompanyDetails({
          requestBody: req.body,
          createdByType: 'client-user',
          createdBy: req.user._id,
          createdByName: req.user.name,
          clientId: req.user.clientId,
        });
        break;
      case 'documents':
        // const entityTypes = ['TRUST', 'PARTNERSHIP'];
        // const debtorStage = 2;
        await Debtor.updateOne({ _id: req.body.debtorId }, { debtorStage: 2 });

        response = await Debtor.findById(req.body.debtorId)
          .select('_id debtorStage')
          .lean();
        // await Application.findById(req.body.applicationId)
        //   .select('_id debtorStage')
        //   .lean();
        break;
      case 'confirmation':
        message = await submitDebtor({
          debtorId: req.body.debtorId,
          userId: req.user.clientId,
          userType: 'client-user',
          userName: req.user.name,
        });

        response = {
          debtorStage: 3,
        };

        // checkForAutomation({
        //   debtorId: req.body.debtorId,
        //   userType: 'user',
        //   userId: req.user._id,
        // });
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
 * Update Debtor Details
 */
router.put('/details/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const update = {};
    const clientDebtor = await ClientDebtor.findById(
      req.params.debtorId,
    ).lean();
    const debtor = await Debtor.findById(clientDebtor.debtorId).lean();
    if (req.body.address && Object.keys(req.body.address).length !== 0) {
      update.address = {};
      if (req.body.address.property) {
        update.address.property = req.body.address.property;
      } else {
        delete update.address.property;
      }
      if (req.body.address.unitNumber) {
        update.address.unitNumber = req.body.address.unitNumber;
      } else {
        delete update.address.unitNumber;
      }
      if (req.body.address.streetNumber) {
        update.address.streetNumber = req.body.address.streetNumber;
      } else {
        delete update.address.streetNumber;
      }
      if (req.body.address.streetName) {
        update.address.streetName = req.body.address.streetName;
      } else {
        delete update.address.streetName;
      }
      if (req.body.address.streetType) {
        update.address.streetType = req.body.address.streetType;
      } else {
        delete update.address.streetType;
      }
      if (req.body.address.suburb) {
        update.address.suburb = req.body.address.suburb;
      } else {
        delete update.address.suburb;
      }
      update.address.state = debtor.address.state;
      if (req.body.address.postCode) {
        update.address.postCode = req.body.address.postCode;
      } else {
        delete update.address.postCode;
      }
      update.address.country = debtor.address.country;
    }
    update.contactNumber = req.body.contactNumber
      ? req.body.contactNumber
      : undefined;
    update.tradingName = req.body.tradingName
      ? req.body.tradingName
      : undefined;
    if (req.body.reviewDate) {
      update.reviewDate = req.body.reviewDate;
    }
    await Debtor.updateOne({ _id: clientDebtor.debtorId }, update);
    await addAuditLog({
      entityType: 'debtor',
      entityRefId: debtor._id,
      actionType: 'edit',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: `A debtor ${debtor.entityName} is successfully updated by ${req.user.name}`,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Debtors details updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update debtor details ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download credit-limit in CSV
 */
router.get('/download/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === 'debtor-credit-limit',
    );
    const debtorColumn = [
      'name',
      'contactNumber',
      'activeApplicationId',
      'creditLimit',
      'limitType',
      'expiryDate',
      'abn',
      'acn',
      'createdAt',
      'updatedAt',
    ];
    const response = await getDebtorCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn,
      moduleColumn: module.manageColumns,
      debtorId: req.params.debtorId,
    });
    if (response && response.docs.length !== 0) {
      const debtor = await Debtor.findOne({ _id: req.params.debtorId })
        .select('debtorCode')
        .lean();
      const finalArray = await formatCSVList({
        moduleColumn: debtorColumn,
        response: response.docs,
      });
      const csvResponse = await convertToCSV(finalArray);
      const fileName = debtor.debtorCode + '-credit-limit' + '.csv';
      res.header('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      res.send(csvResponse);
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

const formatCSVList = async ({ response, moduleColumn }) => {
  try {
    const finalArray = [];
    let data = {};
    response.forEach((i) => {
      data = {};
      moduleColumn.map((key) => {
        if (
          (key === 'entityName' ||
            key === 'activeApplicationId' ||
            key === 'name') &&
          i[key] &&
          i[key]['value']
        ) {
          i[key] = i[key]['value'];
        }
        if (
          (key === 'expiryDate' ||
            key === 'inceptionDate' ||
            key === 'createdAt' ||
            key === 'updatedAt') &&
          i[key]
        ) {
          i[key] =
            new Date(i[key]).getDate() +
            '-' +
            (new Date(i[key]).getMonth() + 1) +
            '-' +
            new Date(i[key]).getFullYear();
        }
        data[key] = i[key];
      });
      finalArray.push(data);
    });
    return finalArray;
  } catch (e) {
    Logger.log.error('Error occurred in format credit-limit list');
    Logger.log.error(e.message || e);
  }
};

const convertToCSV = (arr) => {
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(arr);
  return csv;
};

/**
 * Export Router
 */
module.exports = router;
