/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const multer = require('multer');
let mongoose = require('mongoose');
const ImportApplicationDump = mongoose.model('import-application-dump');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  readExcelFile,
  processAndValidateApplications,
  generateApplications,
} = require('./../helper/import-application-dump.helper');
const StaticFileHelper = require('./../helper/static-file.helper');
const StaticFile = require('./../static-files/moduleColumn');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/*
 * Upload new import file
 * */
router.post('/', upload.single('dump-file'), async function (req, res) {
  if (!req.file.buffer) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let helperResponse = await readExcelFile(req.file.buffer);
    if (!helperResponse.isImportCompleted) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: helperResponse.reasonForInCompletion,
      });
    } else {
      const module = StaticFile.modules.find(
        (i) => i.name === 'import-application',
      );
      let responseBody = {
        headers: module.manageColumns,
        docs: helperResponse.unProcessedApplications,
        toBeProcessedApplicationCount: helperResponse.applications.length,
      };
      let importApplicationDump = new ImportApplicationDump({
        applications: helperResponse.applications,
      });
      await importApplicationDump.save();
      responseBody.importId = importApplicationDump._id;
      res.status(200).send({
        status: 'SUCCESS',
        data: responseBody,
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error occurred in upload new import applications file',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/*
 * Update import file module
 * */
router.put('/:importId', async function (req, res) {
  if (!req.params.importId || !req.query.stepName) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === 'import-application',
    );
    let responseBody;
    let helperResponse;
    switch (req.query.stepName) {
      case 'VALIDATE_APPLICATIONS':
        helperResponse = await processAndValidateApplications(
          req.params.importId,
        );
        await ImportApplicationDump.updateOne(
          {
            _id: req.params.importId,
          },
          {
            applications: helperResponse.applications,
            currentStepIndex: 'VALIDATED',
          },
        );
        responseBody = {
          headers: module.manageColumns,
          docs: helperResponse.unProcessedApplications,
          toBeProcessedApplicationCount: helperResponse.applications.length,
        };
        break;
      case 'GENERATE_APPLICATIONS':
        helperResponse = await generateApplications(
          req.params.importId,
          req.user._id,
        );
        await ImportApplicationDump.updateOne(
          {
            _id: req.params.importId,
          },
          {
            currentStepIndex: 'PROCESSED',
          },
        );
        responseBody = {
          status: 'SUCCESS',
          headers: module.manageColumns,
          docs: helperResponse.unProcessedApplications,
          toBeProcessedApplicationCount: helperResponse.applicationCount,
          message: 'Import completed.',
        };
        break;
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: responseBody,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in update import file module',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/*
 * Delete import file
 * */
router.delete('/:importId', async function (req, res) {
  if (!req.params.importId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    await ImportApplicationDump.deleteOne({ _id: req.params.importId });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Import dump deleted successfully.',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete file module', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/*
 * Get Sample Excel File from S3
 * */
router.get('/sample-file', async function (req, res) {
  try {
    const fileBuffer = await StaticFileHelper.downloadDocument({
      filePath: 'static-files/application-dump/Import_Applications.xlsx',
    });
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'Import_Applications.xlsx',
    );
    return fileBuffer.pipe(res);
  } catch (e) {
    Logger.log.error(
      'Error occurred in get Sample Excel File from S3',
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
