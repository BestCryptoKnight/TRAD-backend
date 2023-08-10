/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');
const Insurer = mongoose.model('insurer');
const InsurerUser = mongoose.model('insurer-user');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');
const Application = mongoose.model('application');
const Task = mongoose.model('task');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { getRegexForSearch } = require('./audit-log.helper');

/**
 * Get User list for Global search
 */
const getUserList = async ({
  moduleAccess,
  userId,
  searchString,
  limit = 100,
}) => {
  try {
    const access = moduleAccess.find((i) => {
      return i.name === 'user';
    });
    const queryFilter = {
      isDeleted: false,
    };
    if (access && access.accessTypes.indexOf('full-access') === -1) {
      queryFilter._id = userId;
    }
    queryFilter.name = {
      $regex: getRegexForSearch(searchString),
      $options: 'i',
    };
    const users = await User.find(queryFilter)
      .select('_id name')
      .limit(limit)
      .lean();
    users.forEach((user) => {
      user.title = user.name;
      user.module = 'user';
      user.hasSubModule = false;
      delete user.name;
    });
    return users;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

/**
 * Get Client list for Global search
 */
const getClientList = async ({
  moduleAccess,
  userId,
  searchString,
  isForRisk,
  clientId,
  isForGlobalSearch = true,
  limit = 100,
}) => {
  try {
    let queryFilter = {
      isDeleted: false,
    };
    if (isForRisk) {
      const access = moduleAccess.find((i) => {
        return i.name === 'client';
      });
      if (access && access.accessTypes.indexOf('full-access') === -1) {
        queryFilter = {
          isDeleted: false,
          $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
        };
      }
    } else {
      queryFilter._id = clientId;
    }
    queryFilter.name = {
      $regex: getRegexForSearch(searchString),
      $options: 'i',
    };
    const fields = isForGlobalSearch ? '_id name' : '_id name crmClientId';
    let clients;
    if (isForGlobalSearch) {
      clients = await Client.find(queryFilter)
        .select(fields)
        .limit(limit)
        .lean();
      const clientIds = clients.map((i) => i._id);
      clients.forEach((user) => {
        user.title = user.name;
        user.module = 'client';
        user.hasSubModule = false;
        delete user.name;
      });
      queryFilter = {
        clientIds: { $in: clientIds },
        name: { $regex: getRegexForSearch(searchString), $options: 'i' },
      };
      const clientUsers = await ClientUser.find(queryFilter)
        .select('_id name clientId')
        .limit(limit)
        .lean();
      clientUsers.forEach((user) => {
        delete user._id;
        user._id = user.clientId;
        user.title = user.name;
        user.module = 'client';
        user.hasSubModule = true;
        user.subModule = 'contacts';
        delete user.name;
      });
      clients = clients.concat(clientUsers);
    } else {
      clients = await Client.find(queryFilter).select(fields).lean();
    }
    return clients;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in client module',
      e.message || e,
    );
  }
};

const getInsurerList = async ({ searchString, limit = 100 }) => {
  try {
    const queryFilter = {
      isDeleted: false,
      name: { $regex: getRegexForSearch(searchString), $options: 'i' },
    };
    const [insurers, users] = await Promise.all([
      Insurer.find(queryFilter).select('_id name').limit(limit).lean(),
      InsurerUser.find(queryFilter)
        .select('_id name insurerId')
        .limit(limit)
        .lean(),
    ]);
    insurers.forEach((insurer) => {
      insurer.title = insurer.name;
      insurer.module = 'insurer';
      insurer.hasSubModule = false;
      delete insurer.name;
    });
    users.forEach((user) => {
      delete user._id;
      user.title = user.name;
      user._id = user.insurerId;
      user.module = 'insurer';
      user.hasSubModule = true;
      user.subModule = 'contacts';
      delete user.name;
    });
    const response = insurers.concat(users);
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in insurer module',
      e.message || e,
    );
  }
};

/**
 * Get Debtor list for Global search & Entity search drop-down
 */
const getDebtorList = async ({
  moduleAccess,
  userId,
  searchString,
  isForGlobalSearch = true,
  requestFrom,
  isForRisk = true,
  isForFilter = true,
  clientId,
  limit = 100,
}) => {
  try {
    let queryFilter = {};
    if (moduleAccess && isForRisk && isForFilter) {
      const access = moduleAccess?.find((i) => {
        return i.name === 'debtor';
      });
      if (access && access.accessTypes.indexOf('full-access') === -1) {
        const clients = await Client.find({
          isDeleted: false,
          $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
        })
          .select({ _id: 1 })
          .lean();
        const clientIds = clients.map((i) => i._id);
        const clientDebtor = await ClientDebtor.find({
          clientId: { $in: clientIds },
          isActive: true,
        })
          .select('_id debtorId')
          .lean();
        const debtorIds = clientDebtor.map((i) => i.debtorId);
        queryFilter = {
          _id: { $in: debtorIds },
        };
      }
    } else if (!isForRisk && isForFilter && clientId) {
      const clientDebtor = await ClientDebtor.find({
        clientId: clientId,
        isActive: true,
      })
        .select('debtorId')
        .lean();
      const debtorIds = clientDebtor.map((i) => i.debtorId);
      queryFilter = {
        _id: { $in: debtorIds },
      };
    }
    const fields = isForGlobalSearch
      ? '_id entityName'
      : requestFrom && requestFrom === 'overdue'
      ? '_id entityName acn'
      : '_id entityName abn acn registrationNumber';
    let debtors;
    if (isForGlobalSearch) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          {
            entityName: {
              $regex: getRegexForSearch(searchString),
              $options: 'i',
            },
          },
          {
            tradingName: {
              $regex: getRegexForSearch(searchString),
              $options: 'i',
            },
          },
          {
            acn: {
              $regex: searchString,
              $options: 'i',
            },
          },
          {
            abn: {
              $regex: searchString,
              $options: 'i',
            },
          },
          {
            registrationNumber: {
              $regex: searchString,
              $options: 'i',
            },
          },
          {
            _id: {
              $in: await Application.distinct('debtorId', {
                clientReference: {
                  $regex: searchString,
                  $options: 'i',
                },
                _id: {
                  $in: await ClientDebtor.distinct('activeApplicationId'),
                },
              }),
            },
          },
        ],
      });
      debtors = await Debtor.find(queryFilter)
        .select(fields)
        .limit(limit)
        .lean();
      debtors.forEach((debtor) => {
        debtor.title = debtor.entityName;
        debtor.module = 'debtors';
        debtor.hasSubModule = false;
        delete debtor.entityName;
      });
    } else {
      queryFilter.entityName = {
        $regex: getRegexForSearch(searchString),
        $options: 'i',
      };
      debtors = await Debtor.find(queryFilter).select(fields).lean();
      if (requestFrom && requestFrom === 'overdue') {
        debtors.forEach((debtor) => {
          debtor.name = debtor.entityName;
          delete debtor.entityName;
        });
      } else {
        debtors.forEach((debtor) => {
          debtor.name =
            debtor.entityName +
            ' (' +
            (debtor.abn
              ? debtor.abn
              : debtor.acn
              ? debtor.acn
              : debtor.registrationNumber) +
            ')';
          delete debtor.entityName;
          delete debtor.abn;
          delete debtor.acn;
          delete debtor.registrationNumber;
        });
      }
    }
    return debtors;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in debtor module',
      e.message || e,
    );
  }
};

/**
 * Get DebtorDirector list for Global search for risk panel
 */
const getDebtorDirectorList = async ({ searchString, limit = 100 }) => {
  try {
    let queryFilter = {};
    const stakeholderName = searchString.split(' ');
    let stakeholderFields = [];
    if (stakeholderName.length == 3) {
      stakeholderFields = [
        {
          firstName: {
            $regex: getRegexForSearch(stakeholderName[0]),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          middleName: {
            $regex: getRegexForSearch(stakeholderName[1]),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          lastName: {
            $regex: getRegexForSearch(stakeholderName[2]),
            $options: 'i',
          },
          isDeleted: false,
        },
      ];
    } else if (stakeholderName.length == 2) {
      stakeholderFields = [
        {
          firstName: {
            $regex: getRegexForSearch(stakeholderName[0]),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          lastName: {
            $regex: getRegexForSearch(stakeholderName[1]),
            $options: 'i',
          },
          isDeleted: false,
        },
      ];
    } else {
      stakeholderFields = [
        {
          firstName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          middleName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          lastName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
      ];
    }
    queryFilter = {
      $or: [
        {
          entityName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          acn: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          abn: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
        {
          registrationNumber: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
          isDeleted: false,
        },
      ],
    };
    queryFilter.$or = queryFilter.$or.concat(stakeholderFields);
    let [debtorDirector] = await Promise.all([
      DebtorDirector.find(queryFilter)
        .select('_id entityName debtorId firstName lastName middleName')
        .limit(limit)
        .lean(),
    ]);
    if (stakeholderName.length === 3 || stakeholderName.length === 2) {
      debtorDirector = debtorDirector.filter((v) => {
        let result = false;
        if (v.entityName) result = true;
        else if (
          stakeholderName.length === 3 &&
          v.firstName.toLowerCase() === stakeholderName[0].toLowerCase() &&
          v.middleName.toLowerCase() === stakeholderName[1].toLowerCase() &&
          v.lastName.toLowerCase() === stakeholderName[2].toLowerCase()
        )
          result = true;
        else if (
          stakeholderName.length === 2 &&
          v.firstName.toLowerCase() === stakeholderName[0].toLowerCase() &&
          v.lastName.toLowerCase() === stakeholderName[1].toLowerCase()
        )
          result = true;
        return result;
      });
    }

    debtorDirector.forEach((dd) => {
      let showStakeholderName = '';
      if (dd.entityName) {
        showStakeholderName = showStakeholderName + dd.entityName;
      } else {
        if (dd.firstName) {
          if (dd.middleName) {
            showStakeholderName = showStakeholderName + dd.firstName + ' ';
            showStakeholderName = showStakeholderName + dd.middleName + ' ';
            showStakeholderName = showStakeholderName + dd.lastName;
          } else {
            showStakeholderName = showStakeholderName + dd.firstName + ' ';
            showStakeholderName = showStakeholderName + dd.lastName;
          }
        }
      }
      delete dd._id;
      delete dd.firstName;
      delete dd.middleName;
      delete dd.lastName;
      delete dd.entityName;
      dd.title = showStakeholderName;
      dd._id = dd.debtorId;
      dd.module = 'debtors';
      dd.hasSubModule = true;
      dd.subModule = 'stakeholder';
    });
    const response = debtorDirector;
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in debtorDirector module',
      e.message || e,
    );
  }
};

/**
 * Get DebtorDirector list for Global search for client panel
 */
const getDebtorDirectorListClient = async ({
  searchString,
  clientId,
  limit = 100,
}) => {
  try {
    const stakeholderName = searchString.split(' ');
    let stakeholderFields = [];
    if (stakeholderName.length == 3) {
      stakeholderFields = [
        {
          firstName: {
            $regex: getRegexForSearch(stakeholderName[0]),
            $options: 'i',
          },
        },
        {
          middleName: {
            $regex: getRegexForSearch(stakeholderName[1]),
            $options: 'i',
          },
        },
        {
          lastName: {
            $regex: getRegexForSearch(stakeholderName[2]),
            $options: 'i',
          },
        },
      ];
    } else if (stakeholderName.length == 2) {
      stakeholderFields = [
        {
          firstName: {
            $regex: getRegexForSearch(stakeholderName[0]),
            $options: 'i',
          },
        },
        {
          lastName: {
            $regex: getRegexForSearch(stakeholderName[1]),
            $options: 'i',
          },
        },
      ];
    } else {
      stakeholderFields = [
        {
          firstName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
        },
        {
          middleName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
        },
        {
          lastName: {
            $regex: getRegexForSearch(searchString),
            $options: 'i',
          },
        },
      ];
    }
    let queryFilter = [
      {
        $match: {
          clientId: mongoose.Types.ObjectId(clientId),
          status: { $exists: true, $in: ['APPROVED', 'DECLINED'] },
        },
      },
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          $or: [
            { 'debtorId.entityType': 'PARTNERSHIP' },
            { 'debtorId.entityType': 'TRUST' },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          clientId: '$clientId',
          debtorId: '$debtorId._id',
          entityType: '$debtorId.entityType',
        },
      },
      {
        $lookup: {
          from: 'debtor-directors',
          localField: 'debtorId',
          foreignField: 'debtorId',
          as: 'debtorDirector',
        },
      },
      {
        $unwind: {
          path: '$debtorDirector',
        },
      },
      {
        $project: {
          _id: 1,
          entityName: '$debtorDirector.entityName',
          firstName: '$debtorDirector.firstName',
          middleName: '$debtorDirector.middleName',
          lastName: '$debtorDirector.lastName',
          abn: '$debtorDirector.abn',
          acn: '$debtorDirector.acn',
          registrationNumber: '$debtorDirector.registrationNumber',
          isDeleted: '$debtorDirector.isDeleted',
        },
      },
      {
        $match: {
          $and: [
            { isDeleted: false },
            {
              $or: [
                {
                  entityName: {
                    $regex: getRegexForSearch(searchString),
                    $options: 'i',
                  },
                },
                {
                  abn: {
                    $regex: getRegexForSearch(searchString),
                    $options: 'i',
                  },
                },
                {
                  acn: {
                    $regex: getRegexForSearch(searchString),
                    $options: 'i',
                  },
                },
                {
                  registrationNumber: {
                    $regex: getRegexForSearch(searchString),
                    $options: 'i',
                  },
                },
              ],
            },
          ],
        },
      },
      { $limit: limit },
    ];
    queryFilter[queryFilter.length - 2].$match.$and[1].$or = queryFilter[
      queryFilter.length - 2
    ].$match.$and[1].$or.concat(stakeholderFields);

    let debtors = await ClientDebtor.aggregate(queryFilter).allowDiskUse(true);
    if (stakeholderName.length === 3 || stakeholderName.length === 2) {
      debtors = debtors.filter((v) => {
        let result = false;
        if (v.entityName) result = true;
        else if (
          stakeholderName.length === 3 &&
          v.firstName.toLowerCase() === stakeholderName[0].toLowerCase() &&
          v.middleName.toLowerCase() === stakeholderName[1].toLowerCase() &&
          v.lastName.toLowerCase() === stakeholderName[2].toLowerCase()
        )
          result = true;
        else if (
          stakeholderName.length === 2 &&
          v.firstName.toLowerCase() === stakeholderName[0].toLowerCase() &&
          v.lastName.toLowerCase() === stakeholderName[1].toLowerCase()
        )
          result = true;
        return result;
      });
    }
    debtors.forEach((debtor) => {
      let title = '';
      if (debtor.entityName) {
        title = title + debtor.entityName;
      } else {
        if (debtor.firstName) {
          if (debtor.middleName) {
            title = title + debtor.firstName + ' ';
            title = title + debtor.middleName + ' ';
            title = title + debtor.lastName;
          } else {
            title = title + debtor.firstName + ' ';
            title = title + debtor.lastName;
          }
        }
      }
      delete debtor.abn;
      delete debtor.acn;
      delete debtor.registrationNumber;
      delete debtor.firstName;
      delete debtor.middleName;
      delete debtor.lastName;
      delete debtor.entityName;
      delete debtor.isDeleted;
      debtor.title = title;
      debtor.module = 'credit limit';
      debtor.hasSubModule = true;
      debtor.subModule = 'stakeholder';
    });
    return debtors;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in Debtor Director List Client module',
      e.message || e,
    );
  }
};
/**
 * Get Task list for Global search
 */
const getTaskList = async ({
  moduleAccess,
  userId,
  searchString,
  isForRisk,
  limit = 100,
}) => {
  try {
    let queryFilter = {
      isDeleted: false,
    };
    if (isForRisk) {
      const access = moduleAccess.find((i) => {
        return i.name === 'task';
      });
      if (access && access.accessTypes.indexOf('full-access') === -1) {
        queryFilter = {
          isDeleted: false,
          $or: [{ assigneeId: userId }, { createdById: userId }],
        };
      }
    } else {
      queryFilter = {
        isDeleted: false,
        $or: [{ assigneeId: userId }, { createdById: userId }],
      };
    }
    queryFilter.description = {
      $regex: getRegexForSearch(searchString),
      $options: 'i',
    };
    const tasks = await Task.find(queryFilter)
      .select('_id description')
      .limit(limit)
      .lean();
    tasks.forEach((task) => {
      task.title = task.description;
      task.module = 'task';
      task.hasSubModule = false;
    });
    return tasks;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in task module',
      e.message || e,
    );
  }
};

/**
 * Get Application List for Global search & Entity search
 */
const getApplicationList = async ({
  moduleAccess,
  userId,
  searchString,
  isForRisk,
  clientId,
  isForGlobalSearch = true,
  limit = 100,
}) => {
  try {
    const queryFilter = {};
    if (isForRisk) {
      const access = moduleAccess.find((i) => {
        return i.name === 'application';
      });
      if (access && access.accessTypes.indexOf('full-access') === -1) {
        const clients = await Client.find({
          isDeleted: false,
          $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
        })
          .select({ _id: 1 })
          .lean();
        const clientIds = clients.map((i) => i._id);
        queryFilter.clientId = { $in: clientIds };
      }
    } else {
      queryFilter.clientId = clientId;
    }
    queryFilter.applicationId = {
      $regex: getRegexForSearch(searchString),
      $options: 'i',
    };
    const fields = isForGlobalSearch
      ? '_id applicationId status applicationStage'
      : '_id applicationId';
    let applications;
    if (isForGlobalSearch) {
      applications = await Application.find(queryFilter)
        .select(fields)
        .limit(limit)
        .lean();
      applications.forEach((application) => {
        application.title = application.applicationId;
        application.module = 'application';
        application.hasSubModule = false;
        delete application.applicationId;
      });
    } else {
      applications = await Application.find(queryFilter).select(fields).lean();
    }
    return applications;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in application module',
      e.message || e,
    );
  }
};

/*
Get Debtor List for Client Panel
 */
const getClientDebtorList = async ({ searchString, clientId, limit = 100 }) => {
  try {
    let queryFilter = {
      // isActive: true,
      clientId: mongoose.Types.ObjectId(clientId),
      status: { $exists: true, $in: ['APPROVED', 'DECLINED'] },
      // creditLimit: { $exists: true, $ne: null },
      // $and: [
      //   { creditLimit: { $exists: true } },
      //   { creditLimit: { $ne: null } },
      //   { creditLimit: { $ne: 0 } },
      // ],
    };
    /* const debtors = await ClientDebtor.find(queryFilter)
      .populate({
        path: 'debtorId',
        match: {
          $or: [
            {
              entityName: {
                $regex: getRegexForSearch(searchString),
                $options: 'i',
              },
            },
            {
              acn: {
                $regex: searchString,
                $options: 'i',
              },
            },
            {
              abn: {
                $regex: searchString,
                $options: 'i',
              },
            },
            {
              registrationNumber: {
                $regex: searchString,
                $options: 'i',
              },
            },
          ],
        },
        select: 'entityName abn acn',
      })
      .select('_id debtorId')
      .lean();*/
    const debtors = await ClientDebtor.aggregate([
      { $match: queryFilter },
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          $or: [
            {
              'debtorId.entityName': {
                $regex: getRegexForSearch(searchString),
                $options: 'i',
              },
            },
            {
              'debtorId.tradingName': {
                $regex: getRegexForSearch(searchString),
                $options: 'i',
              },
            },
            {
              'debtorId.acn': {
                $regex: searchString,
                $options: 'i',
              },
            },
            {
              'debtorId.abn': {
                $regex: searchString,
                $options: 'i',
              },
            },
            {
              'debtorId.registrationNumber': {
                $regex: searchString,
                $options: 'i',
              },
            },
            {
              activeApplicationId: {
                $in: await Application.distinct('_id', {
                  clientReference: {
                    $regex: searchString,
                    $options: 'i',
                  },
                }),
              },
            },
          ],
        },
      },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          'debtorId.entityName': 1,
        },
      },
    ]).allowDiskUse(true);

    debtors.forEach((debtor) => {
      debtor.title = debtor?.debtorId?.entityName;
      debtor.module = 'debtors';
      debtor.hasSubModule = false;
      delete debtor.debtorId;
    });
    return debtors;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in client-debtor module',
      e.message || e,
    );
  }
};

module.exports = {
  getUserList,
  getClients: getClientList,
  getInsurerList,
  getDebtorList,
  getDebtorDirectorList,
  getTaskList,
  getApplications: getApplicationList,
  getClientDebtorList,
  getDebtorDirectorListClient,
};
