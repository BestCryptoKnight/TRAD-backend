/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Task = mongoose.model('task');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Insurer = mongoose.model('insurer');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { getRegexForSearch } = require('./audit-log.helper');

const createTask = async ({
  description,
  comments,
  priority,
  entityType,
  entityId,
  createdByType,
  createdById,
  assigneeType,
  assigneeId,
  dueDate,
}) => {
  try {
    const task = await Task.create({
      description,
      comments,
      priority,
      entityType,
      entityId,
      createdByType,
      createdById,
      assigneeType,
      assigneeId,
      dueDate,
    });
    return task;
  } catch (e) {
    Logger.log.error('Error occurred in creating task ', e);
  }
};

const getApplicationList = async ({
  hasFullAccess = false,
  isForRisk = false,
  userId,
  page = 1,
  limit = 200,
}) => {
  try {
    let clientIds;
    if (!isForRisk) {
      clientIds = [userId];
    } else {
      const query = hasFullAccess
        ? { isDeleted: false }
        : {
            isDeleted: false,
            $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
          };
      const clients = await Client.find(query).select('_id').lean();
      clientIds = clients.map((i) => i._id);
    }
    const applications = await Application.find({
      clientId: { $in: clientIds },
    })
      .select('_id applicationId')
      .limit(limit)
      .skip(page ? (page - 1) * limit : page)
      .lean();
    return applications;
  } catch (e) {
    Logger.log.error('Error occurred in get application list', e.message || e);
  }
};

const insurerList = async () => {
  try {
    const insurer = await Insurer.find({}).select('_id name').lean();
    return insurer;
  } catch (e) {
    Logger.log.error('Error occurred in get insurer list', e.message || e);
  }
};

//TODO add condition for claims and overdue
const aggregationQuery = async ({
  taskColumn,
  requestedQuery,
  isForRisk = true,
  hasFullAccess = false,
  userId,
  isForDownload = false,
}) => {
  try {
    let queryFilter = {
      isDeleted: false,
      isCompleted: false,
      entityType: {
        $nin: ['application'],
      },
    };
    const filterArray = [];
    const query = [];
    let aggregationQuery = [];

    const listCreatedBy = requestedQuery.listCreatedBy
      ? requestedQuery.listCreatedBy
      : false;
    if (requestedQuery.search) {
      queryFilter.description = {
        $regex: getRegexForSearch(requestedQuery.search),
        $options: 'i',
      };
    }
    if (requestedQuery.requestedEntityId) {
      queryFilter.entityId = mongoose.Types.ObjectId(
        requestedQuery.requestedEntityId,
      );
    } else if (!hasFullAccess && !isForRisk) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { assigneeId: mongoose.Types.ObjectId(userId) },
          { createdById: mongoose.Types.ObjectId(userId) },
        ],
      });
    }

    if (!hasFullAccess && !listCreatedBy && isForRisk) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { assigneeId: mongoose.Types.ObjectId(userId) },
          { createdById: mongoose.Types.ObjectId(userId) },
        ],
      });
    }
    if (listCreatedBy) {
      queryFilter.createdById = mongoose.Types.ObjectId(userId);
    }

    if (requestedQuery.priority) {
      queryFilter.priority = requestedQuery.priority.toUpperCase();
      if (isForDownload) {
        filterArray.push({
          label: 'Priority',
          value: requestedQuery.priority,
          type: 'string',
        });
      }
    }
    if (requestedQuery.isCompleted) {
      queryFilter.isCompleted = requestedQuery.isCompleted === 'true';
      if (isForDownload) {
        filterArray.push({
          label: 'Completed Task',
          value: 'Yes',
          type: 'string',
        });
      }
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
      queryFilter.dueDate = dateQuery;
    }
    let sortingOptions = {};

    if (taskColumn.includes('assigneeId') || requestedQuery.assigneeId) {
      aggregationQuery.push(
        {
          $addFields: {
            clientUserId: {
              $cond: [
                { $eq: ['$assigneeType', 'client-user'] },
                '$assigneeId',
                null,
              ],
            },
            userId: {
              $cond: [{ $eq: ['$assigneeType', 'user'] }, '$assigneeId', null],
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
            assigneeId: {
              $cond: [
                { $eq: ['$assigneeType', 'client-user'] },
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
          },
        },
      );
    }

    if (requestedQuery.assigneeId && requestedQuery.assigneeId !== 'all_user') {
      aggregationQuery.push({
        $match: {
          'assigneeId._id': mongoose.Types.ObjectId(requestedQuery.assigneeId),
          entityType: {
            $nin: ['application'],
          },
        },
      });
    } else if (isForRisk && !requestedQuery.requestedEntityId) {
      if (requestedQuery.assigneeId !== 'all_user') {
        aggregationQuery.push({
          $match: {
            $and: [
              {
                $or: [
                  { assigneeId: mongoose.Types.ObjectId(userId) },
                  {
                    'assigneeId._id': mongoose.Types.ObjectId(userId),
                  },
                ],
              },
              {
                entityType: {
                  $nin: ['application'],
                },
              },
            ],
          },
        });
      }
    }

    if (taskColumn.includes('entityId')) {
      query.push(
        {
          $addFields: {
            userId: {
              $cond: [{ $eq: ['$entityType', 'user'] }, '$entityId', null],
            },
            clientId: {
              $cond: [{ $eq: ['$entityType', 'client'] }, '$entityId', null],
            },
            clientUserId: {
              $cond: [
                { $eq: ['$entityType', 'client-user'] },
                '$entityId',
                null,
              ],
            },
            debtorId: {
              $cond: [{ $eq: ['$entityType', 'debtor'] }, '$entityId', null],
            },
            applicationId: {
              $cond: [
                { $eq: ['$entityType', 'application'] },
                '$entityId',
                null,
              ],
            },
            insurerId: {
              $cond: [{ $eq: ['$entityType', 'insurer'] }, '$entityId', null],
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
        /* {
            $lookup: {
              from: 'client-debtors',
              localField: 'debtorId',
              foreignField: '_id',
              as: 'debtorId',
            },
          },*/
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
            from: 'insurers',
            localField: 'insurerId',
            foreignField: '_id',
            as: 'insurerId',
          },
        },
        {
          $addFields: {
            entityId: {
              $cond: [
                { $eq: ['$entityType', 'client'] },
                {
                  name: '$clientId.name',
                  _id: '$clientId._id',
                  type: '$entityType',
                },
                {
                  $cond: [
                    { $eq: ['$entityType', 'debtor'] },
                    {
                      name: '$debtorId.entityName',
                      _id: '$debtorId._id',
                      type: '$entityType',
                    },
                    {
                      $cond: [
                        { $eq: ['$entityType', 'application'] },
                        {
                          name: '$applicationId.applicationId',
                          _id: '$applicationId._id',
                          type: '$entityType',
                        },
                        {
                          $cond: [
                            { $eq: ['$entityType', 'client-user'] },
                            {
                              name: '$clientUserId.name',
                              _id: '$clientUserId._id',
                              type: '$entityType',
                            },
                            {
                              $cond: [
                                { $eq: ['$entityType', 'user'] },
                                {
                                  name: '$userId.name',
                                  _id: '$userId._id',
                                  type: '$entityType',
                                },
                                {
                                  $cond: [
                                    { $eq: ['$entityType', 'insurer'] },
                                    {
                                      name: '$insurerId.name',
                                      _id: '$insurerId._id',
                                      type: '$entityType',
                                    },
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
          },
        },
      );
    }

    if (taskColumn.includes('createdById') || requestedQuery.createdById) {
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

    if (requestedQuery.createdById) {
      query.push({
        $match: {
          'createdById.name': requestedQuery.createdById,
          entityType: {
            $nin: ['application'],
          },
        },
      });
    }

    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    } else {
      aggregationQuery.push({
        $sort: { isCompleted: 1, dueDate: 1, completedDate: -1 },
      });
    }

    const fields = taskColumn.map((i) => [i, 1]);
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

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
    } else {
      aggregationQuery = aggregationQuery.concat(query);
    }
    aggregationQuery.unshift({ $match: queryFilter });

    return { query: aggregationQuery, filterArray };
  } catch (e) {
    Logger.log.error(
      'Error occurred in task aggregation query ',
      e.message || e,
    );
  }
};

module.exports = {
  createTask,
  aggregationQuery,
  getApplicationList,
  insurerList,
};
