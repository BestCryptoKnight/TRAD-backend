/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Application = mongoose.model('application');
const Organization = mongoose.model('organization');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');
const User = mongoose.model('user');
const ClientUser = mongoose.model('client-user');
const Document = mongoose.model('document');
const { deleteFile } = require('./../helper/static-file.helper');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const config = require('./../config');
const { createDebtor, getLimitType } = require('./debtor.helper');
const {
  checkEntityType,
  identifyInsurer,
  insurerQBE,
  insurerBond,
  insurerTrad,
  insurerEuler,
  insurerCoface,
  insurerAtradius,
} = require('./automation.helper');
const {
  getEntityDetailsByABN,
  getEntityDetailsByNZBN,
  getEntityDetailsByACN,
  getEntityListByNameFromNZBN,
} = require('./abr.helper');
const { addAuditLog, getRegexForSearch } = require('./audit-log.helper');
const { storeStakeholderDetails } = require('./stakeholder.helper');
const { createTask } = require('./task.helper');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');
const { formatString } = require('./overdue.helper');
const { generateDecisionLetter } = require('./pdf-generator.helper');
const { sendMail } = require('./mailer.helper');
const { addNote } = require('./note.helper');
const { checkForEntityInProfile } = require('./alert.helper');

//TODO add filter for expiry-date + credit-limit
const getApplicationList = async ({
  applicationColumn,
  requestedQuery,
  isForRisk = true,
  hasFullAccess = false,
  queryFilter = {},
  moduleColumn,
  userId,
  isForDownload = false,
  clientId = null,
  hasOnlyReadAccessForClientModule = false,
  hasOnlyReadAccessForDebtorModule = false,
}) => {
  try {
    const query = [];
    let aggregationQuery = [];
    const filterArray = [];
    let sortingOptions = {};
    requestedQuery ? null : (requestedQuery = {});
    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';

    // queryFilter.isDeleted = false;
    if (requestedQuery.clientId) {
      requestedQuery.clientId = mongoose.Types.ObjectId(
        requestedQuery.clientId,
      );
      queryFilter.clientId = requestedQuery.clientId;
      if (isForDownload) {
        const client = await Client.findOne({ _id: requestedQuery.clientId })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: client && client.name ? client.name : '',
          type: 'string',
        });
      }
    } else if (userId && isForRisk) {
      let queryCondition = { status: { $ne: 'DRAFT' } };
      const clients = await Client.find({
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id')
        .lean();
      if (!hasFullAccess && clients.length !== 0) {
        queryCondition = {
          // status: { $ne: 'DRAFT' },
          clientId: {
            $in: clients.map((i) => mongoose.Types.ObjectId(i._id)),
          },
        };

        queryFilter = Object.assign({}, queryFilter, {
          $or: [
            queryCondition,
            { createdById: mongoose.Types.ObjectId(userId), status: 'DRAFT' },
          ],
        });
      } else {
        queryFilter = Object.assign({}, queryFilter, {
          $or: [
            queryCondition,
            {
              clientId: {
                $in: clients.map((i) => mongoose.Types.ObjectId(i._id)),
              },
            },
            { createdById: mongoose.Types.ObjectId(userId), status: 'DRAFT' },
          ],
        });
      }
    }

    if (requestedQuery.search) {
      queryFilter.applicationId = {
        $regex: getRegexForSearch(requestedQuery.search),
        $options: 'i',
      };
    }
    if (requestedQuery.status) {
      queryFilter.status = { $in: requestedQuery.status.split(',') };
      if (isForDownload) {
        filterArray.push({
          label: 'Application Status',
          value: formatString(requestedQuery.status),
          type: 'string',
        });
      }
    }
    if (
      applicationColumn.includes('clientId') ||
      requestedQuery.clientId ||
      requestedQuery.riskAnalystId ||
      requestedQuery.serviceManagerId
    ) {
      query.push(
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $unwind: {
            path: '$clientId',
          },
        },
      );
    }

    if (requestedQuery.riskAnalystId) {
      query.push({
        $match: {
          'clientId.riskAnalystId': mongoose.Types.ObjectId(
            requestedQuery.riskAnalystId,
          ),
        },
      });
    }
    if (requestedQuery.serviceManagerId) {
      query.push({
        $match: {
          'clientId.serviceManagerId': mongoose.Types.ObjectId(
            requestedQuery.serviceManagerId,
          ),
        },
      });
    }
    if (requestedQuery.debtorId) {
      requestedQuery.debtorId = mongoose.Types.ObjectId(
        requestedQuery.debtorId,
      );
      queryFilter.debtorId = requestedQuery.debtorId;
      if (isForDownload) {
        const debtor = await Debtor.findOne({ _id: requestedQuery.debtorId })
          .select('entityName')
          .lean();
        filterArray.push({
          label: 'Debtor',
          value: debtor && debtor.entityName ? debtor.entityName : '',
          type: 'string',
        });
      }
    }
    if (
      applicationColumn.includes('debtorId') ||
      requestedQuery.debtorId ||
      applicationColumn.includes('entityType') ||
      requestedQuery.entityType
    ) {
      query.push(
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $unwind: {
            path: '$debtorId',
          },
        },
      );
    }

    if (applicationColumn.includes('createdById')) {
      query.push(
        {
          $addFields: {
            clientUserId: {
              $cond: [
                { $eq: ['$createdByType', 'client-user'] },
                '$createdById',
                null,
              ],
            },
            userId: {
              $cond: [
                { $eq: ['$createdByType', 'user'] },
                '$createdById',
                null,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'userId',
          },
        },
        {
          $lookup: {
            from: 'clients',
            localField: 'clientUserId',
            foreignField: '_id',
            as: 'clientUserId',
          },
        },
        {
          $addFields: {
            createdById: {
              $cond: [
                { $eq: ['$createdByType', 'client-user'] },
                '$clientUserId.name',
                '$userId.name',
              ],
            },
          },
        },
      );
    }

    if (requestedQuery.entityType) {
      query.push({
        $match: {
          'debtorId.entityType': requestedQuery.entityType,
        },
      });
      if (isForDownload) {
        filterArray.push({
          label: 'Debtor Entity Type',
          value: formatString(requestedQuery.entityType),
          type: 'string',
        });
      }
    }

    if (requestedQuery.minCreditLimit || requestedQuery.maxCreditLimit) {
      let limitQuery = {};
      if (requestedQuery.minCreditLimit) {
        limitQuery = {
          $gte: parseInt(requestedQuery.minCreditLimit),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Minimum Credit Limit',
            value: parseInt(requestedQuery.minCreditLimit),
            type: 'amount',
          });
        }
      }
      if (requestedQuery.maxCreditLimit) {
        limitQuery = Object.assign({}, limitQuery, {
          $lte: parseInt(requestedQuery.maxCreditLimit),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'Maximum Credit Limit',
            value: parseInt(requestedQuery.maxCreditLimit),
            type: 'amount',
          });
        }
      }
      queryFilter.creditLimit = limitQuery;
      /*query.push({
        $match: {
          creditLimit: {
            $gte: parseInt(requestedQuery.minCreditLimit),
            $lt: parseInt(requestedQuery.maxCreditLimit),
          },
        },
      });*/
    }

    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Start Date',
            value: requestedQuery.startDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'End Date',
            value: requestedQuery.endDate,
            type: 'date',
          });
        }
      }
      queryFilter.expiryDate = dateQuery;
    }

    const fields = applicationColumn.map((i) => {
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    if (applicationColumn.includes('debtorId')) {
      fields.push(['debtorId._id', 1]);
    }
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (clientId) {
      query.push({
        $match: { 'clientId._id': clientId },
      });
    }

    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      if (requestedQuery.sortBy === 'clientId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.name';
      }
      if (requestedQuery.sortBy === 'debtorId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.entityName';
      }
      if (requestedQuery.sortBy === 'entityType') {
        requestedQuery.sortBy = 'debtorId.' + requestedQuery.sortBy;
      }
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }

    if (requestedQuery.page && requestedQuery.limit) {
      aggregationQuery.push({
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
            ...query,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else if (query.length !== 0) {
      aggregationQuery = aggregationQuery.concat(query);
    }
    aggregationQuery.unshift({ $match: queryFilter });

    const applications = await Application.aggregate(
      aggregationQuery,
    ).allowDiskUse(true);

    const response =
      applications && applications[0] && applications[0]['paginatedResult']
        ? applications[0]['paginatedResult']
        : applications;

    const total =
      applications.length !== 0 &&
      applications[0]['totalCount'] &&
      applications[0]['totalCount'].length !== 0
        ? applications[0]['totalCount'][0]['count']
        : 0;

    if (response && response.length !== 0) {
      response.forEach((application) => {
        if (applicationColumn.includes('entityType')) {
          application.entityType = formatString(
            application.debtorId.entityType,
          );
        }
        if (applicationColumn.includes('status')) {
          application.status = formatString(application.status);
        }
        if (applicationColumn.includes('clientId')) {
          application.clientId = hasOnlyReadAccessForClientModule
            ? application.clientId.name
            : {
                id: application.clientId._id,
                value: application.clientId.name,
              };
        }
        if (applicationColumn.includes('debtorId')) {
          application.debtorId = hasOnlyReadAccessForDebtorModule
            ? application.debtorId.entityName
            : {
                id: application.debtorId._id,
                value: application.debtorId.entityName,
              };
        } else {
          delete application.debtorId;
        }
        /* if (!applicationColumn.includes('debtorId')) {
          delete application.debtorId;
        }*/
        if (applicationColumn.includes('createdById')) {
          application.createdById =
            application.createdById && application.createdById[0]
              ? application.createdById[0]
              : '';
        }
        if (application.hasOwnProperty('isExtendedPaymentTerms')) {
          application.isExtendedPaymentTerms = application.isExtendedPaymentTerms
            ? 'Yes'
            : 'No';
        }
        if (application.hasOwnProperty('isPassedOverdueAmount')) {
          application.isPassedOverdueAmount = application.isPassedOverdueAmount
            ? 'Yes'
            : 'No';
        }
        if (application?.limitType) {
          application.limitType = getLimitType(application.limitType);
        }
        delete application.clientDebtorId;
      });
    }
    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (applicationColumn.includes(moduleColumn[i].name)) {
        if (
          (moduleColumn[i].name === 'clientId' &&
            hasOnlyReadAccessForClientModule) ||
          (moduleColumn[i].name === 'debtorId' &&
            hasOnlyReadAccessForDebtorModule)
        ) {
          headers.push({
            name: moduleColumn[i].name,
            label: moduleColumn[i].label,
            type: 'string',
          });
        } else {
          headers.push(moduleColumn[i]);
        }
      }
    }
    response.forEach((v) => {
      !v.hasOwnProperty('acceptedAmount') ? (v['acceptedAmount'] = 0) : null;
      !v.hasOwnProperty('creditLimit') ? (v['creditLimit'] = 0) : null;
    });
    const applicationResponse = {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
      filterArray,
    };
    if (isForDownload) {
      applicationResponse.filterArray = filterArray;
    }
    return applicationResponse;
  } catch (e) {
    Logger.log.error('Error occurred in get aggregation stages ', e);
  }
};
/**
 * Delete Draft application and its saved documents
 */
const deleteDraftApplication = async (applicationId) => {
  try {
    let uploadedDocuments = await Document.find({
      entityRefId: applicationId,
    });
    const promiseArray = [];
    uploadedDocuments.map((v) => {
      if (v.keyPath) {
        //delete document from s3
        promiseArray.push(deleteFile({ filePath: v.keyPath }));
      }
    });
    Promise.all(promiseArray);
    //delete stored documents
    await Document.deleteMany({
      entityRefId: applicationId,
    });
    //delete stored application
    await Application.deleteOne({
      _id: applicationId,
    });
    return 'Draft Application deleted successfully';
  } catch (e) {
    Logger.log.error(
      'Error occurred in deleting Draft application',
      e.message || e,
    );
  }
};

//TODO verify ABN & ACN
const storeCompanyDetails = async ({
  requestBody,
  createdBy,
  createdByType,
  createdByName,
  clientId,
}) => {
  try {
    const organization = await Organization.findOne({ isDeleted: false })
      .select('entityCount')
      .lean();
    const client = await Client.findOne({ _id: clientId }).lean();
    let isDebtorExists = true;
    let query;
    if (requestBody.registrationNumber) {
      query = { registrationNumber: requestBody.registrationNumber };
    } else if (requestBody.abn) {
      query = { abn: requestBody.abn };
    } else {
      query = { acn: requestBody.acn };
    }
    const debtorData = await Debtor.findOne(query).lean();
    if (!debtorData) {
      isDebtorExists = false;
    } else {
      if (requestBody.entityType !== debtorData.entityType) {
        if (
          requestBody.hasOwnProperty('removeStakeholders') &&
          requestBody.removeStakeholders
        ) {
          await DebtorDirector.updateMany(
            { debtorId: debtorData._id, isDeleted: false },
            { isDeleted: true },
          );
        } else {
          const stakeholders = await DebtorDirector.find({
            isDeleted: false,
            debtorId: debtorData._id,
          })
            .select('_id type')
            .lean();
          if (stakeholders.length !== 0) {
            return {
              status: 'ERROR',
              messageCode: 'ENTITY_TYPE_CHANGED',
              message: 'Debtor entity type is changed',
            };
          }
        }
      }
    }
    if (!requestBody.applicationId) {
      if (debtorData) {
        const application = await Application.findOne({
          clientId: clientId,
          debtorId: debtorData._id,
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
        if (application) {
          return {
            status: 'ERROR',
            messageCode: 'APPLICATION_ALREADY_EXISTS',
            message:
              'Application already exists, please create with another debtor',
          };
        }
      }
    }
    if (
      requestBody.address.country.code === 'AUS' &&
      (requestBody.abn || requestBody.acn)
    ) {
      let entityData;
      if (requestBody.abn) {
        entityData = await getEntityDetailsByABN({
          searchString: requestBody.abn,
        });
      } else {
        entityData = await getEntityDetailsByACN({
          searchString: requestBody.acn,
        });
      }
      if (
        !entityData ||
        !entityData.response ||
        !(
          entityData.response.businessEntity202001 ||
          entityData.response.businessEntity201408 ||
          requestBody.acn
        )
      ) {
        return {
          status: 'ERROR',
          messageCode: 'INVALID_NUMBER',
          message: requestBody.abn
            ? 'Invalid Australian Business Number'
            : 'Invalid Australian Company Number',
        };
      }
    }
    if (
      requestBody.address.country.code === 'NZL' &&
      (requestBody.abn || requestBody.acn)
    ) {
      let entityData;
      if (requestBody.abn) {
        entityData = await getEntityDetailsByNZBN({
          searchString: requestBody.abn,
        });
      } else {
        entityData = await getEntityListByNameFromNZBN({
          searchString: requestBody.acn,
        });
        if (entityData && entityData.items && entityData.items.length !== 0) {
          for (let i = 0; i < entityData.items.length; i++) {
            if (
              entityData.items[i]?.sourceRegisterUniqueId === requestBody.acn
            ) {
              entityData = entityData.items[i];
              break;
            }
          }
        }
      }
      if (entityData && entityData.status === 'ERROR') {
        return entityData;
      }
      if (!entityData || !entityData.nzbn || !entityData.entityName) {
        return {
          status: 'ERROR',
          messageCode: 'INVALID_NUMBER',
          message: requestBody.abn
            ? 'Invalid New Zealand Business Number'
            : 'Invalid New Zealand Company Number',
        };
      }
    }
    const { debtor, clientDebtor } = await createDebtor({
      requestBody,
      organization,
      isDebtorExists,
      userId: createdBy,
      userName: createdByName,
      clientId,
      userType: createdByType,
    });
    const applicationDetails = {
      clientId: clientId,
      debtorId: debtor._id,
      clientDebtorId: clientDebtor._id,
      applicationStage: 1,
    };
    let application;
    if (requestBody.applicationId) {
      application = await Application.findById(
        requestBody.applicationId,
      ).lean();
    }
    if (!requestBody.applicationId) {
      applicationDetails.applicationId =
        client.clientCode +
        '-' +
        debtor.debtorCode +
        '-' +
        new Date().toISOString().split('T')[0].replace(/-/g, '') +
        '-' +
        (organization.entityCount.application + 1).toString().padStart(3, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.application': 1 } },
      );
      applicationDetails.createdById = createdBy;
      applicationDetails.createdByType = createdByType;
      application = await Application.create(applicationDetails);
    } else {
      if (application.applicationId) {
        const previousId = application.applicationId.split('-');
        applicationDetails.applicationId =
          client.clientCode +
          '-' +
          debtor.debtorCode +
          '-' +
          previousId[2] +
          '-' +
          previousId[3];
      }
      await Application.updateOne(
        { _id: requestBody.applicationId },
        applicationDetails,
      );
      application = await Application.findById(requestBody.applicationId)
        .select('_id applicationStage')
        .lean();
      if (!application) {
        return {
          status: 'ERROR',
          messageCode: 'NO_APPLICATION_FOUND',
          message: 'No application found',
        };
      }
    }
    const partners = await DebtorDirector.find({
      debtorId: debtor._id,
      isDeleted: false,
    })
      .select({ __v: 0, updatedAt: 0, createdAt: 0, isDeleted: 0 })
      .lean();
    partners.forEach((data) => {
      data.isDisabled = true;
    });
    application.partners = partners;
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in store company details ', e);
    return Promise.reject(e);
  }
};

const storePartnerDetails = async ({ requestBody }) => {
  try {
    const applicationData = await Application.findById(
      requestBody.applicationId,
    ).lean();
    if (!applicationData) {
      return {
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application exists',
      };
    }
    let individualCount = 0;
    let companyCount = 0;
    requestBody.partners.forEach((data) =>
      data.type.toLowerCase() === 'company'
        ? companyCount++
        : individualCount++,
    );
    const isValidate = partnerDetailsValidation({
      entityType: requestBody.entityType,
      individualCount,
      companyCount,
    });
    if (!isValidate) {
      return {
        status: 'ERROR',
        messageCode: 'INSUFFICIENT_DATA',
        message: 'Insufficient partners details',
      };
    }
    const promises = [];
    for (let i = 0; i < requestBody.partners.length; i++) {
      if (requestBody.partners[i].type.toLowerCase() === 'individual') {
        if (
          !requestBody.partners[i].title ||
          !requestBody.partners[i].firstName ||
          !requestBody.partners[i].lastName ||
          !requestBody.partners[i].dateOfBirth ||
          !requestBody.partners[i].address ||
          !requestBody.partners[i].address.state ||
          !requestBody.partners[i].address.postCode ||
          !requestBody.partners[i].address.streetNumber
        ) {
          return {
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing',
          };
        }
        const { query, update, unsetFields } = await storeStakeholderDetails({
          debtorId: applicationData.debtorId,
          stakeholder: requestBody.partners[i],
        });
        promises.push(
          DebtorDirector.updateOne(
            query,
            { $set: update, $unset: unsetFields },
            { upsert: true },
          ),
        );
      } else {
        if (
          !requestBody.partners[i].entityName ||
          !requestBody.partners[i].entityType ||
          (!requestBody.partners[i].abn &&
            !requestBody.partners[i].acn &&
            !requestBody.partners[i].registrationNumber)
        ) {
          return {
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing',
          };
        }
        const { query, update, unsetFields } = await storeStakeholderDetails({
          debtorId: applicationData.debtorId,
          stakeholder: requestBody.partners[i],
        });
        promises.push(
          DebtorDirector.updateOne(
            query,
            { $set: update, $unset: unsetFields },
            { upsert: true },
          ),
        );
      }
    }
    promises.push(
      Application.updateOne(
        { _id: requestBody.applicationId },
        { applicationStage: 2 },
      ),
    );
    await Promise.all(promises);
    const application = await Application.findById(requestBody.applicationId)
      .select('_id applicationStage')
      .lean();
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in store partners details ', e);
  }
};

const storeCreditLimitDetails = async ({ requestBody }) => {
  try {
    let application = await Application.findById(requestBody.applicationId)
      .populate({ path: 'debtorId', select: 'entityType' })
      .select('_id applicationStage debtorId')
      .lean();
    const entityTypes = ['TRUST', 'PARTNERSHIP'];
    const update = {
      creditLimit: requestBody.creditLimit,
      isExtendedPaymentTerms: requestBody.isExtendedPaymentTerms,
      isPassedOverdueAmount: requestBody.isPassedOverdueAmount,
      applicationStage: !entityTypes.includes(application.debtorId.entityType)
        ? 2
        : 3,
    };
    update.outstandingAmount = requestBody?.outstandingAmount || undefined;
    update.orderOnHand = requestBody?.orderOnHand || undefined;
    update.note = requestBody?.note || '';
    update.extendedPaymentTermsDetails =
      requestBody?.extendedPaymentTermsDetails || '';
    update.passedOverdueDetails = requestBody?.passedOverdueDetails || '';
    update.clientReference = requestBody?.clientReference || '';
    await Application.updateOne({ _id: requestBody.applicationId }, update);
    application = await Application.findById(requestBody.applicationId)
      .select('_id applicationStage')
      .lean();
    return application;
  } catch (e) {
    Logger.log.error(
      'Error occurred in store credit-limit details ',
      e.message || e,
    );
  }
};

const submitApplication = async ({
  applicationId,
  userId,
  userName,
  userType,
}) => {
  try {
    const application = await Application.findOne({
      _id: applicationId,
    })
      .populate({ path: 'clientId', select: '_id name' })
      .lean();
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
      return {
        status: 'ERROR',
        messageCode: 'APPLICATION_ALREADY_EXISTS',
        message: 'Application already exists',
      };
    }
    if (application && application.note) {
      await addNote({
        userType: userType,
        userId: userId,
        userName: userType === 'user' ? userName : application.clientId.name,
        description: application.note,
        noteFor: 'application',
        entityId: applicationId,
      });
    }
    await Application.updateOne(
      { _id: applicationId },
      {
        $set: {
          status: 'SUBMITTED',
          $inc: { applicationStage: 1 },
          requestDate: new Date(),
          note: '',
        },
      },
    );
    await addAuditLog({
      entityType: 'application',
      entityRefId: application._id,
      actionType: 'add',
      userType: userType,
      userRefId: userId,
      logDescription: `A new application ${
        application.applicationId
      } is successfully generated by ${
        userType === 'user' ? userName : application.clientId.name
      }`,
    });
    return 'Application submitted successfully.';
  } catch (e) {
    Logger.log.error('Error occurred in submit application');
    Logger.log.error(e);
  }
};

const partnerDetailsValidation = ({
  entityType,
  individualCount,
  companyCount,
}) => {
  try {
    let response = false;
    switch (entityType) {
      case 'PROPRIETARY_LIMITED':
      case 'LIMITED':
        response = individualCount >= 1 && companyCount === 0;
        break;
      case 'PARTNERSHIP':
        response =
          individualCount >= 2 ||
          (individualCount >= 1 && companyCount >= 1) ||
          companyCount >= 2;
        break;
      case 'SOLE_TRADER':
        response = individualCount === 1 && companyCount === 0;
        break;
      case 'TRUST':
        response = individualCount >= 1 || companyCount >= 1;
        break;
      case 'BUSINESS':
      case 'CORPORATION':
      case 'GOVERNMENT':
      case 'INCORPORATED':
      case 'NO_LIABILITY':
      case 'PROPRIETARY':
      case 'REGISTERED_BODY':
        response = individualCount >= 1 && companyCount === 0;
        break;
    }
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in partner details validation',
      e.message || e,
    );
  }
};

const checkForAutomation = async ({ applicationId, userId, userType }) => {
  try {
    const application = await Application.findById(applicationId)
      .populate({ path: 'clientId', populate: { path: 'insurerId' } })
      .populate('debtorId clientDebtorId')
      .lean();
    let continueWithAutomation = true;
    let blockers = [];

    if (!application) {
      continueWithAutomation = false;
      blockers.push('No Application found');
    }

    //TODO uncomment after flag added in client
    if (continueWithAutomation && !application.clientId.isAutoApproveAllowed) {
      continueWithAutomation = false;
      blockers.push('Automation is not Allowed');
    }

    if (
      continueWithAutomation &&
      application.debtorId.address &&
      application.debtorId.address.country
    ) {
      if (
        application.debtorId.address.country.code !== 'AUS' &&
        application.debtorId.address.country.code !== 'NZL'
      ) {
        continueWithAutomation = false;
        blockers.push('Foreign Buyer');
      }
    }

    const policy = {};
    if (continueWithAutomation) {
      //TODO check product type base on flag/field (RMP/CI)
      const [ciPolicy, rmpPolicy] = await Promise.all([
        Policy.findOne({
          clientId: application.clientId,
          product: { $regex: '.*Credit Insurance.*' },
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            'clientId product creditChecks policyPeriod excess discretionaryLimit inceptionDate expiryDate',
          )
          .lean(),
        Policy.findOne({
          clientId: application.clientId,
          $or: [
            { product: { $regex: '.*Risk Management Package.*' } },
            { product: { $regex: '.*Risk Management.*' } },
          ],
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            'clientId product creditChecks policyPeriod excess discretionaryLimit inceptionDate expiryDate',
          )
          .lean(),
      ]);
      if (!rmpPolicy) {
        continueWithAutomation = false;
        blockers.push('No RMP policy found');
      }
      if (!ciPolicy) {
        continueWithAutomation = false;
        blockers.push('No CI policy found');
      }
      let discretionaryLimit;
      if (continueWithAutomation) {
        const startDate =
          ciPolicy && ciPolicy.inceptionDate
            ? ciPolicy.inceptionDate
            : rmpPolicy.inceptionDate;
        const endDate =
          ciPolicy && ciPolicy.expiryDate
            ? ciPolicy.expiryDate
            : rmpPolicy.expiryDate;
        const noOfCreditChecks =
          rmpPolicy && rmpPolicy.creditChecks
            ? rmpPolicy.creditChecks
            : ciPolicy && ciPolicy.creditChecks
            ? ciPolicy.creditChecks
            : 0;
        const count = await Application.countDocuments({
          clientId: application.clientId._id,
          status: {
            $nin: ['DRAFT'],
          },
          requestDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
          limitType: { $eq: 'CREDIT_CHECK' },
        }).exec();
        if (count > parseInt(noOfCreditChecks)) {
          continueWithAutomation = false;
          blockers.push('Client has used all Credit checks');
        }
      }
      if (continueWithAutomation) {
        if (ciPolicy.discretionaryLimit || rmpPolicy.discretionaryLimit) {
          discretionaryLimit =
            ciPolicy.discretionaryLimit || rmpPolicy.discretionaryLimit;
          policy['discretionaryLimit'] = discretionaryLimit
            ? parseInt(discretionaryLimit)
            : '';
          policy['excess'] = ciPolicy.excess
            ? parseInt(ciPolicy.excess)
            : rmpPolicy.excess
            ? parseInt(rmpPolicy.excess)
            : '';
        }
        if (
          discretionaryLimit &&
          parseInt(discretionaryLimit) < parseInt(application.creditLimit)
        ) {
          continueWithAutomation = false;
          blockers.push('Credit limit is greater than Discretionary limit');
        }
      }
    }

    let type;
    if (continueWithAutomation) {
      const response = await checkEntityType({
        debtorId: application.debtorId._id,
        entityType: application.debtorId.entityType,
        blockers,
      });
      continueWithAutomation = response.continueWithAutomation;
      blockers = response.blockers;
      type = response.type;
    }
    let identifiedInsurer;
    if (continueWithAutomation && application?.clientId?.insurerId?.name) {
      identifiedInsurer = await identifyInsurer({
        insurerName: application.clientId.insurerId.name,
      });
      let response;
      if (!identifiedInsurer) {
        blockers.push('No insurer found');
      }
      if (identifiedInsurer === 'qbe') {
        response = await insurerQBE({ application, type: type, policy });
      } else if (identifiedInsurer === 'bond') {
        response = await insurerBond({ application, type: type, policy });
      } else if (identifiedInsurer === 'atradius') {
        response = await insurerAtradius({ application, type: type, policy });
      } else if (identifiedInsurer === 'coface') {
        response = await insurerCoface({ application, type: type, policy });
      } else if (identifiedInsurer === 'euler') {
        response = await insurerEuler({ application, type: type, policy });
      } else if (identifiedInsurer === 'trad') {
        blockers.push('RMP only insurer');
        response = await insurerTrad({ application, type: type, policy });
      }
      blockers = blockers.concat(response);
    } else if (continueWithAutomation) {
      continueWithAutomation = false;
      blockers.push('No Insurer found');
    }
    const update = {};
    update.blockers = blockers;
    const date = new Date();
    if (blockers.length === 0 && identifiedInsurer !== 'euler') {
      //TODO approve credit limit
      update.approvalOrDecliningDate = new Date();
      let expiryDate = new Date(date.setMonth(date.getMonth() + 12));
      expiryDate = new Date(expiryDate.setDate(expiryDate.getDate() - 1));
      update.expiryDate = expiryDate;
      update.status = 'APPROVED';
      update.acceptedAmount = application.creditLimit;
      update.isAutoApproved = true;
      if (application.debtorId.address.country.code === 'NZL') {
        update.limitType = 'CREDIT_CHECK_NZ';
      } else {
        update.limitType = 'CREDIT_CHECK';
      }
      await ClientDebtor.updateOne(
        { _id: application.clientDebtorId._id },
        {
          creditLimit: application.creditLimit,
          isEndorsedLimit: false,
          activeApplicationId: applicationId,
          expiryDate: expiryDate,
          isFromOldSystem: false,
          status: 'APPROVED',
        },
      );
      //TODO send notification
      sendNotificationsToUser({
        application,
        userType,
        userId,
        status: 'APPROVED',
      });
    } else {
      //TODO create Task + send Notification
      update.status = 'REVIEW_APPLICATION';
      sendNotificationsToUser({
        application,
        userType,
        userId,
        status: 'REVIEW_APPLICATION',
      });
    }
    //TODO notify user
    await Application.updateOne({ _id: applicationId }, update);
    if (blockers.length === 0 && identifiedInsurer !== 'euler') {
      //TODO uncomment to send decision letter
      if (config.mailer.isForProduction === 'true') {
        sendDecisionLetter({
          applicationId,
          status: 'APPROVED',
          approvedAmount: application.creditLimit,
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in check for automation ', e);
  }
};

const generateNewApplication = async ({
  clientDebtorId,
  createdByType,
  createdById,
  creditLimit,
  applicationId,
  isSurrender,
}) => {
  try {
    const query = applicationId
      ? { _id: applicationId }
      : {
          clientDebtorId: clientDebtorId,
          status: { $in: ['APPROVED', 'DECLINED'] },
        };
    const application = await Application.findOne(query)
      .populate('clientId debtorId')
      .sort({ updatedAt: -1 })
      .lean();
    if (application) {
      const organization = await Organization.findOne({
        isDeleted: false,
      })
        .select('entityCount')
        .lean();
      const applicationDetails = {
        clientId: application.clientId._id,
        debtorId: application.debtorId._id,
        clientDebtorId: clientDebtorId,
        applicationStage: application.applicationStage,
        creditLimit: creditLimit,
        isExtendedPaymentTerms: application.isExtendedPaymentTerms,
        isPassedOverdueAmount: application.isPassedOverdueAmount,
        extendedPaymentTermsDetails: application.extendedPaymentTermsDetails,
        passedOverdueDetails: application.passedOverdueDetails,
        note: application.note,
        createdByType: createdByType,
        createdById: createdById,
        status: 'SUBMITTED',
        requestDate: new Date(),
      };
      applicationDetails.applicationId =
        application.clientId.clientCode +
        '-' +
        application.debtorId.debtorCode +
        '-' +
        new Date().toISOString().split('T')[0].replace(/-/g, '') +
        '-' +
        (organization.entityCount.application + 1).toString().padStart(3, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.application': 1 } },
      );
      if (isSurrender) {
        application.status = 'REVIEW_SURRENDERED';
        applicationDetails.status = 'REVIEW_SURRENDERED';
        applicationDetails.comments = 'Credit Limit requested to Surrender';
        applicationDetails.isAutoApproved = false;
      } else if (creditLimit === 0) {
        applicationDetails.status = 'REVIEW_APPLICATION';
        applicationDetails.isAutoApproved = false;
      }
      const applicationData = await Application.create(applicationDetails);
      if (creditLimit !== 0 && !isSurrender) {
        checkForAutomation({
          applicationId: applicationData._id,
          userId: createdById,
          userType: createdByType,
        });
      } else if (creditLimit === 0 && !isSurrender) {
        sendNotificationsToUser({
          application: applicationData,
          userType: createdByType,
          userId: createdById,
          status: applicationData.status,
        });
      }
    }
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in generate application', e);
  }
};

const applicationDrawerDetails = async ({
  application,
  manageColumns,
  isEditable = false,
}) => {
  try {
    let createdBy;
    if (application.createdByType === 'client-user') {
      createdBy = await Client.findOne({ _id: application.createdById })
        .select('name')
        .lean();
    } else {
      createdBy = await User.findOne({ _id: application.createdById })
        .select('name')
        .lean();
    }
    let response = [];
    let value = '';
    if (isEditable) {
      let extractedObj;
      for (let i = 0; i < manageColumns.length; i++) {
        if (
          manageColumns[i].name === 'limitType' ||
          manageColumns[i].name === 'expiryDate' ||
          manageColumns[i].name === 'approvalOrDecliningDate'
        ) {
          extractedObj = manageColumns.splice(i, 1)[0];
          extractedObj.type =
            extractedObj.name === 'limitType'
              ? 'editableString'
              : 'editableDate';
          manageColumns.splice(0, 0, extractedObj);
        }
      }
    }
    manageColumns.forEach((i) => {
      value =
        i.name === 'clientId'
          ? application['clientId']['name']
          : i.name === 'debtorId'
          ? application['debtorId']['entityName']
          : i.name === 'entityType'
          ? application['debtorId'][i.name]
          : i.name === 'createdById' && createdBy?.['name']
          ? createdBy['name']
          : i.name === 'isExtendedPaymentTerms' ||
            i.name === 'isPassedOverdueAmount'
          ? application[i.name]
            ? 'Yes'
            : 'No'
          : application[i.name]
          ? application[i.name]
          : '';
      if (i.name === 'status' || i.name === 'entityType') {
        value = formatString(value);
      }
      response.push({
        label: i.label,
        value: value,
        type: i.type,
      });
    });
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get application drawer details', e);
  }
};

const sendNotificationsToUser = async ({
  application,
  userId,
  userType,
  userName = null,
  status,
  notifyUser = true,
  notifyClient = true,
  addToProfile = true,
}) => {
  try {
    const client = await Client.findOne({ _id: application.clientId }).lean();
    if (status === 'APPROVED') {
      await addAuditLog({
        entityType: 'application',
        entityRefId: application._id,
        actionType: 'edit',
        userType: 'system',
        logDescription: `An application ${application.applicationId} is being approved`,
      });
      if (application.clientId && notifyClient) {
        const clientNotification = await addNotification({
          userId: application.clientId,
          userType: 'client-user',
          description: `An application ${application.applicationId} is being approved`,
          entityType: 'application',
          entityId: application._id,
        });
        if (clientNotification) {
          sendNotification({
            notificationObj: {
              type: 'APPLICATION_APPROVED',
              data: clientNotification,
            },
            type: 'client-user',
            userId: application.clientId,
          });
        }
      }
      if (client?.riskAnalystId && notifyUser) {
        const userNotification = await addNotification({
          userId: client.riskAnalystId,
          userType: 'user',
          description: `An application ${application.applicationId} is being approved`,
          entityId: application._id,
          entityType: 'application',
        });
        if (userNotification) {
          sendNotification({
            notificationObj: {
              type: 'APPLICATION_APPROVED',
              data: userNotification,
            },
            type: 'user',
            userId: client.riskAnalystId,
          });
        }
      }
      if (application?.debtorId && addToProfile) {
        checkForEntityInProfile({
          action: 'add',
          entityType: 'debtor',
          entityId: application.debtorId,
        });
      }
    } else if (status === 'REVIEW_APPLICATION' && client?.riskAnalystId) {
      const date = new Date();
      const data = {
        description: `Review Application ${application.applicationId}`,
        createdByType: userType,
        createdById: userId,
        assigneeType: 'user',
        assigneeId: client.riskAnalystId,
        dueDate: new Date(date.setDate(date.getDate() + 7)),
        entityType: 'application',
        entityId: application._id,
        priority: 'URGENT',
      };
      const task = await createTask(data);
      await addAuditLog({
        entityType: 'task',
        entityRefId: task._id,
        actionType: 'add',
        userType: userType,
        userRefId: userId,
        logDescription: `A new task for ${application.applicationId} is created by system`,
      });
      const notification = await addNotification({
        userId: task.assigneeId,
        userType: task.assigneeType,
        description: `A new task ${task.description} is assigned by system`,
        entityId: task._id,
        entityType: 'task',
      });
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'TASK_ASSIGNED',
            data: notification,
          },
          type: task.assigneeType,
          userId: task.assigneeId,
        });
      }
    } else if (status === 'DECLINED') {
      await addAuditLog({
        entityType: 'application',
        entityRefId: application._id,
        actionType: 'edit',
        userType: 'system',
        logDescription: `An application ${application.applicationId} is being declined by ${userName}`,
      });
      if (application.clientId) {
        const clientNotification = await addNotification({
          userId: application.clientId,
          userType: 'client-user',
          description: `An application ${application.applicationId} is being declined by ${userName}`,
          entityId: application._id,
          entityType: 'application',
        });
        if (clientNotification) {
          sendNotification({
            notificationObj: {
              type: 'APPLICATION_DECLINED',
              data: clientNotification,
            },
            type: 'client-user',
            userId: application.clientId,
          });
        }
      }
      if (application?.debtorId) {
        checkForEntityInProfile({
          action: 'remove',
          entityType: 'debtor',
          entityId: application.debtorId,
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in send notifications');
    Logger.log.error(e.message || e);
  }
};

const sendDecisionLetter = async ({
  reason = null,
  status,
  approvedAmount,
  applicationId,
  isCreditCheckNZ,
}) => {
  try {
    const application = await Application.findOne({
      _id: applicationId,
    }).lean();
    const clientUsers = await ClientUser.find({
      clientId: application.clientId,
      sendDecisionLetter: true,
      isDeleted: false,
    })
      .select('email')
      .lean();
    if (clientUsers?.length !== 0) {
      const [client, debtor] = await Promise.all([
        Client.findOne({ _id: application.clientId })
          .populate({
            path: 'serviceManagerId',
            select: 'name email contactNumber',
          })
          .lean(),
        Debtor.findOne({ _id: application.debtorId })
          .select('entityName registrationNumber abn acn address')
          .lean(),
      ]);
      const response = {
        status: status,
        clientName: client && client.name ? client.name : '',
        debtorName: debtor && debtor.entityName ? debtor.entityName : '',
        serviceManagerNumber:
          client &&
          client.serviceManagerId &&
          client.serviceManagerId.contactNumber
            ? client.serviceManagerId.contactNumber
            : '',
        requestedAmount: parseInt(application.creditLimit).toFixed(2),
        approvedAmount: approvedAmount.toFixed(2),
        country: debtor?.address?.country?.code,
        tradingName: debtor?.tradingName,
        requestedDate: application.requestDate,
        approvalOrDecliningDate: application.approvalOrDecliningDate,
        expiryDate: application.expiryDate,
      };
      const mailObj = {
        toAddress: [],
        subject: `Decision Letter for ${response.debtorName}`,
        text: {
          clientName: client?.name || '-',
          debtorName: response?.debtorName || '-',
        },
        mailFor: 'decisionLetter',
        attachments: [],
      };
      if (response?.country === 'AUS' || response?.country === 'NZL') {
        response.abn = debtor.abn ? debtor.abn : '';
        response.acn = debtor.acn ? debtor.acn : '';
      } else {
        response.registrationNumber = debtor.registrationNumber
          ? debtor.registrationNumber
          : '';
      }
      if (status === 'DECLINED') {
        response.rejectionReason = reason;
      } else {
        response.approvalStatus = reason;
      }
      if (isCreditCheckNZ === true) {
        response.isCreditCheckOrNZ = 'Credit Check NZ';
      } else {
        response.isCreditCheckOrNZ = 'Credit Check';
      }
      const bufferData = await generateDecisionLetter(response);
      mailObj.attachments.push({
        content: bufferData,
        filename: `decisionLetter.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      });
      mailObj.toAddress = clientUsers.map((i) => i.email);
      await sendMail(mailObj);
    } else {
      Logger.log.info('No user found to send decision letter');
    }
  } catch (e) {
    Logger.log.error('Error occurred in mail decision letter');
    Logger.log.error(e);
  }
};

const checkForPendingApplication = async ({ clientId, debtorId }) => {
  try {
    const application = await Application.findOne({
      debtorId: debtorId,
      clientId: clientId,
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
    return !!application;
  } catch (e) {
    Logger.log.error('Error occurred in check for pending application', e);
  }
};

module.exports = {
  getApplicationList,
  deleteDraftApplication,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
  partnerDetailsValidation,
  checkForAutomation,
  generateNewApplication,
  applicationDrawerDetails,
  sendNotificationsToUser,
  sendDecisionLetter,
  submitApplication,
  checkForPendingApplication,
};
