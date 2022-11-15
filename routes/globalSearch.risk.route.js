/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();

/*
 * Local Imports
 * */
const authenticate = require('./../middlewares/authenticate').authMiddleWare;
const Logger = require('./../services/logger');
const {
  getUserList,
  getClients,
  getInsurerList,
  getDebtorList,
  getDebtorDirectorList,
  getTaskList,
  getApplications,
} = require('./../helper/globalSearch.helper');

router.get('/', authenticate, async function (req, res) {
  if (!req.query.searchString) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const [
      users,
      clients,
      insurers,
      debtors,
      debtorDirector,
      tasks,
      applications,
    ] = await Promise.all([
      getUserList({
        moduleAccess: req.user.moduleAccess,
        searchString: req.query.searchString,
        userId: req.user._id,
      }),
      getClients({
        moduleAccess: req.user.moduleAccess,
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: true,
      }),
      getInsurerList({
        searchString: req.query.searchString,
      }),
      getDebtorList({
        moduleAccess: req.user.moduleAccess,
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: true,
      }),
      getDebtorDirectorList({
        moduleAccess: req.user.moduleAccess,
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: true,
      }),
      getTaskList({
        moduleAccess: req.user.moduleAccess,
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: true,
      }),
      getApplications({
        moduleAccess: req.user.moduleAccess,
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: true,
      }),
    ]);
    let response = users.concat(clients);
    response = response.concat(insurers);
    response = response.concat(debtors);
    response = response.concat(debtorDirector);
    response = response.concat(tasks);
    response = response.concat(applications);
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
 * Export Router
 */
module.exports = router;
