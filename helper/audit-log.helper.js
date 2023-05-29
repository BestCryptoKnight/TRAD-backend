/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const AuditLog = mongoose.model('audit-log');
const Application = mongoose.model('application');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

/*
Add Audit Log
 */
const addAuditLog = async ({
  entityType,
  entityRefId,
  userType,
  userRefId,
  actionType,
  logDescription,
}) => {
  try {
    await AuditLog.create({
      entityType,
      entityRefId,
      userType,
      userRefId,
      actionType,
      logDescription,
    });
    Logger.log.info('Audit log added');
  } catch (e) {
    Logger.log.error(`Error occurred in add audit log `, e.message || e);
  }
};

/*
Get Audit Logs Entity Specific
 */
const getAuditLogs = async ({ entityId }) => {
  try {
    return await AuditLog.find({ entityRefId: entityId })
      .select('_id logDescription createdAt')
      .lean();
  } catch (e) {
    Logger.log.error('Error occurred in get audit log list ', e.message || e);
  }
};

/*
Get Entity Name From Entity ID
 */
const getEntityName = async ({ entityType, entityId }) => {
  try {
    let response;
    let entity;
    switch (entityType) {
      case 'application':
        entity = await Application.findById(entityId).lean();
        response = entity?.applicationId;
        break;
      case 'client':
        entity = await Client.findById(entityId).lean();
        response = entity?.name;
        break;
      case 'debtor':
        entity = await Debtor.findById(entityId).lean();
        response = entity?.entityName;
        break;
      case 'user':
        entity = await User.findById(entityId).lean();
        response = entity?.name;
        break;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get entity name ', e.message || e);
  }
};

const getRegexForSearch = (search) => {
  try {
    return search.trim().replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
  } catch (e) {
    Logger.log.error('Error occurred in get regex for search', e.message || e);
  }
};

/*
Format String
 */
const formatString = (text) => {
  try {
    return text.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  } catch (e) {
    Logger.log.error('Error occurred in format string');
    Logger.log.error(e.message || e);
  }
};

/*
Get Audit Logs
 */
const getAuditLogList = async ({
  requestedQuery,
  auditLogColumn,
  moduleColumn,
  hasFullAccess = false,
  userId,
}) => {
  try {
    const queryFilter = {};
    const sortingOptions = {};
    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';
    sortingOptions[requestedQuery.sortBy] =
      requestedQuery.sortOrder === 'desc' ? -1 : 1;

    if (!hasFullAccess) {
      queryFilter.userRefId = mongoose.Types.ObjectId(userId);
    }
    if (requestedQuery.actionType) {
      queryFilter.actionType = requestedQuery.actionType.toLowerCase();
    }
    if (requestedQuery.entityType) {
      queryFilter.entityType = requestedQuery.entityType.toLowerCase();
    }
    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
      }
      queryFilter.createdAt = dateQuery;
    }

    let query = [];
    let aggregationQuery = [];
    if (auditLogColumn.includes('entityRefId')) {
      query.push(
        {
          $addFields: {
            userId: {
              $cond: [{ $eq: ['$entityType', 'user'] }, '$entityRefId', null],
            },
            clientId: {
              $cond: [{ $eq: ['$entityType', 'client'] }, '$entityRefId', null],
            },
            clientUserId: {
              $cond: [
                { $eq: ['$entityType', 'client-user'] },
                '$entityRefId',
                null,
              ],
            },
            debtorId: {
              $cond: [{ $eq: ['$entityType', 'debtor'] }, '$entityRefId', null],
            },
            applicationId: {
              $cond: [
                { $eq: ['$entityType', 'application'] },
                '$entityRefId',
                null,
              ],
            },
            documentTypeId: {
              $cond: [
                { $eq: ['$entityType', 'document-type'] },
                '$entityRefId',
                null,
              ],
            },
            documentId: {
              $cond: [
                { $eq: ['$entityType', 'document'] },
                '$entityRefId',
                null,
              ],
            },
            insurerId: {
              $cond: [
                { $eq: ['$entityType', 'insurer'] },
                '$entityRefId',
                null,
              ],
            },
            insurerUserId: {
              $cond: [
                { $eq: ['$entityType', 'insurer-user'] },
                '$entityRefId',
                null,
              ],
            },
            policyId: {
              $cond: [{ $eq: ['$entityType', 'policy'] }, '$entityRefId', null],
            },
            taskId: {
              $cond: [{ $eq: ['$entityType', 'task'] }, '$entityRefId', null],
            },
            claimId: {
              $cond: [{ $eq: ['$entityType', 'claim'] }, '$entityRefId', null],
            },
            overdueId: {
              $cond: [
                { $eq: ['$entityType', 'overdue'] },
                '$entityRefId',
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
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $lookup: {
            from: 'client-users',
            localField: 'clientUserId',
            foreignField: '_id',
            as: 'clientUserId',
          },
        },
        // {
        //   $lookup: {
        //     from: 'client-debtors',
        //     localField: 'debtorId',
        //     foreignField: '_id',
        //     as: 'debtorId',
        //   },
        // },
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $lookup: {
            from: 'applications',
            localField: 'applicationId',
            foreignField: '_id',
            as: 'applicationId',
          },
        },
        {
          $lookup: {
            from: 'document-types',
            localField: 'documentTypeId',
            foreignField: '_id',
            as: 'documentTypeId',
          },
        },
        {
          $lookup: {
            from: 'documents',
            localField: 'documentId',
            foreignField: '_id',
            as: 'documentId',
          },
        },
        {
          $lookup: {
            from: 'insurers',
            localField: 'insurerId',
            foreignField: '_id',
            as: 'insurerId',
          },
        },
        {
          $lookup: {
            from: 'insurer-users',
            localField: 'insurerUserId',
            foreignField: '_id',
            as: 'insurerUserId',
          },
        },

        {
          $lookup: {
            from: 'tasks',
            localField: 'taskId',
            foreignField: '_id',
            as: 'taskId',
          },
        },
        {
          $lookup: {
            from: 'policies',
            localField: 'policyId',
            foreignField: '_id',
            as: 'policyId',
          },
        },
        {
          $lookup: {
            from: 'clients',
            localField: 'claimId',
            foreignField: '_id',
            as: 'claimId',
          },
        },
        {
          $lookup: {
            from: 'overdues',
            localField: 'overdueId',
            foreignField: '_id',
            as: 'overdueId',
          },
        },
        {
          $addFields: {
            entityRefId: {
              $cond: [
                { $eq: ['$entityType', 'client'] },
                '$clientId.name',
                {
                  $cond: [
                    { $eq: ['$entityType', 'debtor'] },
                    '$debtorId.entityName',
                    {
                      $cond: [
                        { $eq: ['$entityType', 'application'] },
                        '$applicationId.applicationId',
                        {
                          $cond: [
                            { $eq: ['$entityType', 'client-user'] },
                            '$clientUserId.name',
                            {
                              $cond: [
                                { $eq: ['$entityType', 'user'] },
                                '$userId.name',
                                {
                                  $cond: [
                                    { $eq: ['$entityType', 'document-type'] },
                                    '$documentTypeId.documentTitle',
                                    {
                                      $cond: [
                                        { $eq: ['$entityType', 'document'] },
                                        '$documentId.originalFileName',
                                        {
                                          $cond: [
                                            { $eq: ['$entityType', 'task'] },
                                            '$taskId.description',
                                            {
                                              $cond: [
                                                {
                                                  $eq: ['$entityType', 'claim'],
                                                },
                                                '$claimId.name',
                                                {
                                                  $cond: [
                                                    {
                                                      $eq: [
                                                        '$entityType',
                                                        'policy',
                                                      ],
                                                    },
                                                    '$policyId.policyNumber',
                                                    {
                                                      $cond: [
                                                        {
                                                          $eq: [
                                                            '$entityType',
                                                            'insurer',
                                                          ],
                                                        },
                                                        '$insurerId.name',
                                                        {
                                                          $cond: [
                                                            {
                                                              $eq: [
                                                                '$entityType',
                                                                'insurer-user',
                                                              ],
                                                            },
                                                            '$insurerUserId.name',
                                                            {
                                                              $cond: [
                                                                {
                                                                  $eq: [
                                                                    '$entityType',
                                                                    'overdue',
                                                                  ],
                                                                },
                                                                [
                                                                  '$overdueId.month',
                                                                  '$overdueId.year',
                                                                ],
                                                                null,
                                                              ],
                                                            },
                                                          ],
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                },
                                              ],
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      );
    }

    if (auditLogColumn.includes('userRefId') || requestedQuery.userRefId) {
      const conditions = [
        {
          $addFields: {
            clientUserId: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$entityType', 'overdue'] },
                    { $eq: ['$userType', 'client-user'] },
                  ],
                },
                '$userRefId',
                null,
              ],
            },
            overdueClientUserId: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$entityType', 'overdue'] },
                    { $eq: ['$userType', 'client-user'] },
                  ],
                },
                '$userRefId',
                null,
              ],
            },
            userId: {
              $cond: [{ $eq: ['$userType', 'user'] }, '$userRefId', null],
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
          $lookup: {
            from: 'client-users',
            localField: 'overdueClientUserId',
            foreignField: '_id',
            as: 'overdueClientUserId',
          },
        },
        {
          $lookup: {
            from: 'clients',
            localField: 'overdueClientUserId.clientId',
            foreignField: '_id',
            as: 'overdueClientId',
          },
        },
        {
          $addFields: {
            userRefId: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$entityType', 'overdue'] },
                    { $eq: ['$userType', 'client-user'] },
                  ],
                },
                {
                  name: '$overdueClientId.name',
                  _id: '$overdueClientId._id',
                },
                {
                  $cond: [
                    { $eq: ['$userType', 'client-user'] },
                    {
                      name: '$clientUserId.name',
                      _id: '$clientUserId._id',
                    },
                    {
                      name: '$userId.name',
                      _id: '$userId._id',
                    },
                  ],
                },
              ],
            },
          },
        },
      ];
      if (requestedQuery.userRefId) {
        aggregationQuery = [...aggregationQuery, ...conditions];
        aggregationQuery.push({
          $match: {
            'userRefId._id': mongoose.Types.ObjectId(requestedQuery.userRefId),
          },
        });
      } else {
        query = [...query, ...conditions];
      }
    }

    const fields = auditLogColumn.map((i) => [i, 1]);
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    aggregationQuery.push({ $sort: sortingOptions });

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
    aggregationQuery.unshift({ $match: queryFilter });

    const auditLogs = await AuditLog.aggregate(aggregationQuery).allowDiskUse(
      true,
    );

    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (auditLogColumn.includes(moduleColumn[i].name)) {
        headers.push(moduleColumn[i]);
      }
    }
    if (auditLogs && auditLogs.length !== 0) {
      auditLogs[0].paginatedResult.forEach((log) => {
        if (auditLogColumn.includes('entityRefId')) {
          log.entityRefId =
            log?.entityRefId?.[0] && log.entityRefId?.[1]
              ? log.entityRefId[0] + '/' + log.entityRefId[1]
              : log?.entityRefId?.[0]
              ? log.entityRefId[0]
              : '';
        }
        if (auditLogColumn.includes('userRefId')) {
          log.userRefId =
            log.userRefId && log.userRefId.name && log.userRefId.name[0]
              ? log.userRefId.name[0]
              : '';
        }
        if (log.actionType) {
          log.actionType =
            log.actionType.charAt(0).toUpperCase() + log.actionType.slice(1);
        }
        if (log.entityType) {
          log.entityType = formatString(log.entityType);
        }
        if (log.userType) {
          log.userType =
            log.userType.charAt(0).toUpperCase() + log.userType.slice(1);
        }
      });
    }
    const total =
      auditLogs[0]['totalCount'].length !== 0
        ? auditLogs[0]['totalCount'][0]['count']
        : 0;
    return {
      docs: auditLogs[0].paginatedResult,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error('Error occurred in get audit logs', e);
    return Promise.reject(e.message);
  }
};

module.exports = {
  addAuditLog,
  getAuditLogs,
  getEntityName,
  getRegexForSearch,
  formatString,
  getAuditLogList,
};
