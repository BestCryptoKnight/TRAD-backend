/*
 * Module Imports
 * */
const axios = require('axios');
const convert = require('xml-js');
const mongoose = require('mongoose');
const Application = mongoose.model('application');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getEntityDetailsByABN = ({ searchString }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.abn': 1 });
      const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
      const options = {
        method: 'GET',
        url: url,
      };
      console.log('options: ', options);
      const { data } = await axios(options);
      const jsonData = convert.xml2js(data);
      return resolve(jsonData.elements);
    } catch (e) {
      Logger.log.error('Error in getting entity details from ABN');
      Logger.log.error(e.message || e);
      return reject(e);
    }
  });
};

const getEntityDetailsByACN = ({ searchString }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.abn': 1 });
      const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByASICv201408?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
      const options = {
        method: 'GET',
        url: url,
      };
      const { data } = await axios(options);
      const jsonData = convert.xml2js(data);
      return resolve(jsonData.elements);
    } catch (e) {
      Logger.log.error('Error in getting entity details from ABN lookup ');
      Logger.log.error(e.message || e);
      return reject(e);
    }
  });
};

//TODO add filter for expiry-date + credit-limit
const getApplicationList = async ({
  applicationColumn,
  requestedQuery,
  isForRisk = true,
  hasFullAccess = false,
  queryFilter = {},
  clientIds = [],
  moduleColumn,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      let query = [];
      let sortingOptions = {};
      requestedQuery.page = requestedQuery.page || 1;
      requestedQuery.limit = requestedQuery.limit || 10;
      requestedQuery.sortBy = requestedQuery.sortBy || '_id';
      requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';

      queryFilter.isDeleted = false;
      if (!hasFullAccess && isForRisk && clientIds.length !== 0) {
        queryFilter.clientId = { $in: clientIds };
      }
      if (requestedQuery.search) {
        queryFilter.applicationId = { $regex: `${requestedQuery.search}` };
      }
      if (requestedQuery.status) {
        queryFilter.status = requestedQuery.status;
      }
      if (requestedQuery.clientId || applicationColumn.includes('clientId')) {
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
      if (requestedQuery.clientId) {
        query.push({
          $match: {
            'clientId.name': requestedQuery.clientId,
          },
        });
      }
      if (
        requestedQuery.debtorId ||
        applicationColumn.includes('debtorId') ||
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

      if (requestedQuery.debtorId) {
        query.push({
          $match: {
            'debtorId.entityName': requestedQuery.debtorId,
          },
        });
      }
      if (requestedQuery.entityType) {
        query.push({
          $match: {
            'debtorId.entityType': requestedQuery.entityType,
          },
        });
      }

      if (
        requestedQuery.clientDebtorId ||
        applicationColumn.includes('clientDebtorId') ||
        requestedQuery.debtorId ||
        applicationColumn.includes('debtorId')
      ) {
        query.push(
          {
            $lookup: {
              from: 'client-debtors',
              localField: 'clientDebtorId',
              foreignField: '_id',
              as: 'clientDebtorId',
            },
          },
          {
            $unwind: {
              path: '$clientDebtorId',
            },
          },
        );
      }

      if (requestedQuery.clientDebtorId) {
        query.push({
          $match: {
            'clientDebtorId.creditLimit': requestedQuery.clientDebtorId,
          },
        });
      }

      const fields = applicationColumn.map((i) => {
        /*if (i === 'clientId') {
          i = i + '.name';
        }*/
        if (i === 'debtorId') {
          i = i + '.entityName';
        }
        if (i === 'entityType') {
          i = 'debtorId.' + i;
        }
        return [i, 1];
      });
      if (!applicationColumn.includes('clientDebtorId')) {
        fields.push(['clientDebtorId', 1]);
      }
      query.push({
        $project: fields.reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {}),
      });

      if (requestedQuery.sortBy && requestedQuery.sortOrder) {
        if (requestedQuery.sortBy === 'clientId') {
          requestedQuery.sortBy = requestedQuery.sortBy + '.name';
        }
        if (requestedQuery.sortBy === 'debtorId') {
          requestedQuery.sortBy = requestedQuery.sortBy + '.entityName';
        }
        if (requestedQuery.sortBy === 'clientDebtorId') {
          requestedQuery.sortBy = requestedQuery.sortBy + '.creditLimit';
        }
        if (requestedQuery.sortBy === 'entityType') {
          requestedQuery.sortBy = 'debtorId.' + requestedQuery.sortBy;
        }
        sortingOptions[requestedQuery.sortBy] =
          requestedQuery.sortOrder === 'desc' ? -1 : 1;
        query.push({ $sort: sortingOptions });
      }

      query.push({
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
      query.unshift({ $match: queryFilter });
      console.log('query : ', query);
      const applications = await Application.aggregate(query).allowDiskUse(
        true,
      );
      if (applications && applications.length !== 0) {
        applications[0].paginatedResult.forEach((application) => {
          if (applicationColumn.includes('entityType')) {
            application.entityType = application.debtorId.entityType;
          }
          if (applicationColumn.includes('clientId')) {
            application.clientId = {
              id: application.clientId._id,
              value: application.clientId.name,
            };
          }
          if (applicationColumn.includes('debtorId')) {
            application.debtorId = {
              id: application.clientDebtorId._id,
              value: application.debtorId.entityName,
            };
          }
          if (applicationColumn.includes('clientDebtorId')) {
            application.clientDebtorId = application.clientDebtorId.creditLimit;
          }
          if (!applicationColumn.includes('clientDebtorId')) {
            delete application.clientDebtorId;
          }
        });
      }
      const total =
        applications[0].totalCount.length !== 0
          ? applications[0]['totalCount'][0]['count']
          : 0;

      const headers = [];
      for (let i = 0; i < moduleColumn.length; i++) {
        if (applicationColumn.includes(moduleColumn[i].name)) {
          headers.push(moduleColumn[i]);
        }
      }

      return resolve({
        docs: applications[0].paginatedResult,
        headers,
        total,
        page: parseInt(requestedQuery.page),
        limit: parseInt(requestedQuery.limit),
        pages: Math.ceil(total / parseInt(requestedQuery.limit)),
      });
    } catch (e) {
      Logger.log.error(
        'Error occurred in get aggregation stages ',
        e.message || e,
      );
      return reject(e.message);
    }
  });
};

module.exports = {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getApplicationList,
};
