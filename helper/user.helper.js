/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

let getUserList = async () => {
  try {
    const [riskAnalystList, serviceManagerList] = await Promise.all([
      User.find({ isDeleted: false, role: 'riskAnalyst' })
        .select('_id name')
        .lean(),
      User.find({ isDeleted: false, role: 'serviceManager' })
        .select('_id name')
        .lean(),
    ]);
    return { riskAnalystList, serviceManagerList };
  } catch (e) {
    Logger.log.error(
      `Error occurred in get risk-analyst list `,
      e.message || e,
    );
  }
};

module.exports = { getUserList };
