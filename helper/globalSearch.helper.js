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
const ClientDebtor = mongoose.model('client-debtor');
const Application = mongoose.model('application');
const Task = mongoose.model('task');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getUserList = async ({ moduleAccess, userId, searchString }) => {
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
    queryFilter.name = { $regex: searchString, $options: 'i' };
    const users = await User.find(queryFilter).select('_id name').lean();
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

const getClientList = async ({
  moduleAccess,
  userId,
  searchString,
  isForRisk,
  clientId,
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
    queryFilter.name = { $regex: searchString, $options: 'i' };
    let clients = await Client.find(queryFilter).select('_id name').lean();
    const clientIds = clients.map((i) => i._id);
    clients.forEach((user) => {
      user.title = user.name;
      user.module = 'client';
      user.hasSubModule = false;
      delete user.name;
    });
    queryFilter = {
      clientIds: { $in: clientIds },
      name: { $regex: searchString, $options: 'i' },
    };
    const clientUsers = await ClientUser.find(queryFilter)
      .select('_id name clientId')
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
    return clients;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

const getInsurerList = async ({ searchString }) => {
  try {
    const queryFilter = {
      isDeleted: false,
      name: { $regex: searchString, $options: 'i' },
    };
    const [insurers, users] = await Promise.all([
      Insurer.find(queryFilter).select('_id name').lean(),
      InsurerUser.find(queryFilter).select('_id name insurerId').lean(),
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
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

const getDebtorList = async ({ moduleAccess, userId, searchString }) => {
  try {
    const access = moduleAccess.find((i) => {
      return i.name === 'debtor';
    });
    let queryFilter = {};
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
        .select('_id')
        .lean();
      const debtorIds = clientDebtor.map((i) => i._id);
      queryFilter = {
        _id: { $in: debtorIds },
      };
    }
    queryFilter.entityName = { $regex: searchString, $options: 'i' };
    const debtors = await Debtor.find(queryFilter)
      .select('_id entityName')
      .lean();
    debtors.forEach((debtor) => {
      debtor.title = debtor.entityName;
      debtor.module = 'debtor';
      debtor.hasSubModule = false;
      delete debtor.entityName;
    });
    return debtors;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

const getTaskList = async ({
  moduleAccess,
  userId,
  searchString,
  isForRisk,
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
    queryFilter.description = { $regex: searchString, $options: 'i' };
    const tasks = await Task.find(queryFilter).select('_id description').lean();
    tasks.forEach((task) => {
      task.module = 'task';
      task.hasSubModule = false;
    });
    return tasks;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

const getApplicationList = async ({
  moduleAccess,
  userId,
  searchString,
  isForRisk,
  clientId,
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
    queryFilter.applicationId = { $regex: searchString, $options: 'i' };
    const applications = await Application.find(queryFilter)
      .select('_id applicationId status applicationStage')
      .lean();
    applications.forEach((application) => {
      application.title = application.applicationId;
      application.module = 'application';
      application.hasSubModule = false;
      delete application.applicationId;
    });
    return applications;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

const getClientDebtorList = async ({ searchString, clientId }) => {
  try {
    let queryFilter = {
      isActive: true,
      clientId: mongoose.Types.ObjectId(clientId),
      creditLimit: { $exists: true, $ne: null },
      entityName: { $regex: searchString, $options: 'i' },
    };
    const debtors = await ClientDebtor.find(queryFilter)
      .select('_id entityName')
      .lean();
    debtors.forEach((debtor) => {
      debtor.title = debtor.entityName;
      debtor.module = 'debtor';
      debtor.hasSubModule = false;
      delete debtor.entityName;
    });
    return debtors;
  } catch (e) {
    Logger.log.error(
      'Error occurred while search in user module',
      e.message || e,
    );
  }
};

module.exports = {
  getUserList,
  getClientList,
  getInsurerList,
  getDebtorList,
  getTaskList,
  getApplicationList,
  getClientDebtorList,
};
