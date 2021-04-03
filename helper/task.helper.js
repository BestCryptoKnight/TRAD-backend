/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Task = mongoose.model('task');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

let createTask = async ({
  title,
  description,
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
      title,
      description,
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

const getDebtorList = async ({
  hasFullAccess = false,
  userId,
  isForRisk = false,
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
    const debtors = await ClientDebtor.find({ clientId: { $in: clientIds } })
      .populate({ path: 'debtorId', select: 'entityName' })
      .select('_id')
      .lean();
    debtors.forEach((i) => {
      i.name = i.debtorId.entityName;
      delete i.debtorId;
    });
    return debtors;
  } catch (e) {
    Logger.log.error('Error occurred in get debtor list ', e.message || e);
  }
};

const getApplicationList = async ({
  hasFullAccess = false,
  isForRisk = false,
  userId,
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
      .lean();
    return applications;
  } catch (e) {
    Logger.log.error('Error occurred in get application list ', e.message || e);
  }
};

//TODO add condition for claims and overdue
const aggregationQuery = async ({
  taskColumn,
  requestedQuery,
  isForRisk = true,
  hasFullAccess = false,
  userId,
}) => {
  try {
    const queryFilter = {
      isDeleted: false,
    };
    let query = [];
    const listCreatedBy = requestedQuery.listCreatedBy
      ? requestedQuery.listCreatedBy
      : false;
    if (requestedQuery.search) {
      queryFilter.title = { $regex: `${requestedQuery.search}`, $options: 'i' };
    }
    if (requestedQuery.requestedEntityId) {
      queryFilter.entityId = mongoose.Types.ObjectId(
        requestedQuery.requestedEntityId,
      );
    }
    if (!hasFullAccess && !listCreatedBy) {
      queryFilter.assigneeId = mongoose.Types.ObjectId(userId);
    }
    if (listCreatedBy) {
      queryFilter.createdById = mongoose.Types.ObjectId(userId);
    }

    if (requestedQuery.priority) {
      queryFilter.priority = requestedQuery.priority.toUpperCase();
    }
    if (requestedQuery.isCompleted) {
      queryFilter.isCompleted =
        requestedQuery.isCompleted === 'true' ? true : false;
    }
    if (requestedQuery.startDate) {
      queryFilter.dueDate = {
        $gte: new Date(requestedQuery.startDate),
      };
    }
    if (requestedQuery.endDate) {
      queryFilter.dueDate = {
        $lt: new Date(requestedQuery.endDate),
      };
    }
    let sortingOptions = {};

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
        {
          $lookup: {
            from: 'client-debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId.debtorId',
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
          },
        },
      );
    }

    if (
      (taskColumn.includes('assigneeId') || requestedQuery.assigneeId) &&
      !hasFullAccess &&
      isForRisk
    ) {
      query.push(
        {
          $lookup: {
            from: 'users',
            localField: 'assigneeId',
            foreignField: '_id',
            as: 'assigneeId',
          },
        },
        /*{
          $unwind: '$assigneeId',
        },*/
      );
    } else {
      query.push(
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
            from: 'client-users',
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

    if (requestedQuery.assigneeId) {
      query.push({
        $match: {
          'assigneeId._id': mongoose.Types.ObjectId(requestedQuery.assigneeId),
        },
      });
    }

    if (
      (taskColumn.includes('createdById') || requestedQuery.createdById) &&
      !hasFullAccess &&
      isForRisk
    ) {
      query.push(
        {
          $lookup: {
            from: 'users',
            localField: 'createdById',
            foreignField: '_id',
            as: 'createdById',
          },
        },
        /*{
          $unwind: '$createdById',
        },*/
      );
    } else {
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
            from: 'client-users',
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
        },
      });
    }

    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      query.push({ $sort: sortingOptions });
    } else {
      query.push({ $sort: { dueDate: 1 } });
      query.push({ $sort: { completedDate: -1 } });
      query.push({ $sort: { isCompleted: 1 } });
    }

    const fields = taskColumn.map((i) => [i, 1]);
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

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
    /*query.push({
      $skip:
        (parseInt(requestedQuery.page) - 1) * parseInt(requestedQuery.limit),
    });
    query.push({ $limit: parseInt(requestedQuery.limit) });*/
    query.unshift({ $match: queryFilter });

    return query;
  } catch (e) {
    Logger.log.error(
      'Error occurred in task aggregation query ',
      e.message || e,
    );
  }
};

module.exports = {
  createTask,
  getDebtorList,
  aggregationQuery,
  getApplicationList,
};
