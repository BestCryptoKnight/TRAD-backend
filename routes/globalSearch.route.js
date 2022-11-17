/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();

/*
 * Local Imports
 * */
const authenticate = require('./../middlewares/authenticate')
  .clientAuthMiddleWare;
const Logger = require('./../services/logger');
const {
  getClients,
  getDebtorDirectorListClient,
  getTaskList,
  getApplications,
  getClientDebtorList,
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
      clients,
      debtorDirector,
      debtors,
      tasks,
      applications,
    ] = await Promise.all([
      getClients({
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: false,
        clientId: req.user.clientId,
      }),
      getDebtorDirectorListClient({
        searchString: req.query.searchString,
        clientId: req.user.clientId,
      }),
      getClientDebtorList({
        clientId: req.user.clientId,
        searchString: req.query.searchString,
      }),
      getTaskList({
        searchString: req.query.searchString,
        userId: req.user.clientId,
        isForRisk: false,
      }),
      getApplications({
        searchString: req.query.searchString,
        userId: req.user._id,
        isForRisk: false,
        clientId: req.user.clientId,
      }),
    ]);
    let response = clients.concat(debtorDirector);
    response = response.concat(debtors);
    response = response.concat(tasks);
    response = response.concat(applications);
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in global client panel search',
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
