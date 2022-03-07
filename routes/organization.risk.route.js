/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/systemModules');

/**
 * Get the List of Modules
 */
router.get('/module', async function (req, res) {
  try {
    let modules = StaticFile.modules;
    modules.forEach((i) => {
      i.accessTypes = i.isDefault ? ['read', 'write', 'full-access'] : [];
    });
    res.status(200).send({ status: 'SUCCESS', data: modules });
  } catch (e) {
    Logger.log.error('Error occurred.', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Add Module
 */
// router.post('/module/', async function (req, res) {
//     try {
//         let organizationId = req.user.organizationId;
//         if (!organizationId) {
//             return res.status(400).send({
//                 status: 'ORGANIZATION_ID_NOT_FOUND',
//                 message: 'Sorry, you cannot access this module.'
//             })
//         }
//         if (!req.body.module || !req.body.module.name || !req.body.module.accessTypes || req.body.module.accessTypes.length === 0) {
//             return res.status(400).send({
//                 status: 'MISSING_REQUIRED_FIELDS',
//                 message: 'Missing required fields.'
//             })
//         }
//         await Organization.updateOne({_id: organizationId}, {$push: {modules: req.body.module}});
//         res.status(200).send({status: 'SUCCESS', message: 'Module added successfully.'});
//     } catch (e) {
//         Logger.log.error('Error occurred.', e.message || e);
//         res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
//     }
// });

/**
 * Update Module
 */
// router.put('/module/:id', async function (req, res) {
//     try {
//         let organizationId = req.user.organizationId;
//         let moduleId = req.params.id;
//         if (!organizationId) {
//             return res.status(400).send({
//                 status: 'ORGANIZATION_ID_NOT_FOUND',
//                 message: 'Sorry, you cannot access this module.'
//             })
//         }
//         if (!req.body.module || !moduleId) {
//             return res.status(400).send({
//                 status: 'MISSING_REQUIRED_FIELDS',
//                 message: 'Missing required fields.'
//             })
//         }
//         await Organization.updateOne({_id: organizationId, 'modules._id': moduleId}, {'modules.$': req.body.module});
//         res.status(200).send({status: 'SUCCESS', message: 'Module updated successfully.'});
//     } catch (e) {
//         Logger.log.error('Error occurred.', e.message || e);
//         res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
//     }
// });

/**
 * Delete Module
 */
// router.delete('/module/:id', async function (req, res) {
//     try {
//         let organizationId = req.user.organizationId;
//         let moduleId = mongoose.Types.ObjectId(req.params.id);
//         if (!organizationId) {
//             return res.status(400).send({
//                 status: 'ORGANIZATION_ID_NOT_FOUND',
//                 message: 'Sorry, you cannot access this module.'
//             })
//         }
//         if (!moduleId) {
//             return res.status(400).send({
//                 status: 'MISSING_REQUIRED_FIELDS',
//                 message: 'Missing required fields.'
//             })
//         }
//         await Organization.updateOne({_id: organizationId}, {$pull: {modules: {_id: moduleId}}});
//         res.status(200).send({status: 'SUCCESS', message: 'Module deleted successfully.'});
//     } catch (e) {
//         Logger.log.error('Error occurred.', e.message || e);
//         res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
//     }
// });

/**
 * Get details of Organization
 */
router.get('/', async function (req, res) {
  Logger.log.info('In get organization details call');
  if (!req.user.organizationId) {
    Logger.log.warn('Organization id not found.');
    return res
      .status(400)
      .send({ status: 'ERROR', message: 'Organization id not found.' });
  }
  let organizationId = req.user.organizationId;
  try {
    let organization = await Organization.findOne({ _id: organizationId });
    res.status(200).send({
      status: 'SUCCESS',
      data: organization,
    });
  } catch (e) {
    Logger.log.error('Error occurred.', e.message || e);
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
