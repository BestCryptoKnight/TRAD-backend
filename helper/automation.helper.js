/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const DebtorDirector = mongoose.model('debtor-director');
const CreditReport = mongoose.model('credit-report');
const Application = mongoose.model('application');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { fetchCreditReport } = require('./illion.helper');
const { getEntityDetailsByABN, resolveEntityType } = require('./abr.helper');
const qbe = require('./../static-files/matrixes/qbe.json');
const bond = require('./../static-files/matrixes/bond.json');
const atradius = require('./../static-files/matrixes/atradius.json');
const coface = require('./../static-files/matrixes/coface.json');
const euler = require('./../static-files/matrixes/euler.json');
const trad = require('./../static-files/matrixes/trad.json');
const reports = [
  {
    code: 'HXBCA',
    name: 'HTML Commercial Bureau Enquiry w/ refresh ASIC w/o ASIC Docs',
  },
  {
    code: 'HXPAA',
    name: 'HTML Payment Analysis & ASIC Current Extract',
  },
  {
    code: 'HXPYA',
    name: 'Risk of Late Payment Report (DDS)',
  },
];

const checkEntityType = async ({ entityType, debtorId, blockers }) => {
  try {
    let continueWithAutomation = true;
    let type = 'company';
    if (entityType === 'TRUST') {
      const stakeholders = await DebtorDirector.find({
        debtorId: debtorId,
        isDeleted: false,
      })
        .select('_id type')
        .lean();
      if (stakeholders.length >= 2) {
        continueWithAutomation = false;
        blockers.push(
          'Entity type is Trust and there are more than 1 Trustees',
        );
      } else {
        type = stakeholders[0].type;
      }
    } else if (entityType === 'PARTNERSHIP') {
      continueWithAutomation = false;
      blockers.push('Entity type is Partnership');
    }
    if (entityType === 'SOLE_TRADER') {
      type = 'individual';
    }
    return { continueWithAutomation, blockers, type };
  } catch (e) {
    Logger.log.error(
      'Error occurred in check for entity type ',
      e.message || e,
    );
  }
};

const identifyInsurer = async ({ insurerName }) => {
  try {
    const matrixFileName = [
      'trad',
      'bond',
      'euler',
      'coface',
      'qbe',
      'atradius',
    ];
    let identifiedInsurer;
    matrixFileName.find((i) => {
      if (insurerName.toLowerCase().includes(i)) {
        identifiedInsurer = i;
      }
    });
    return identifiedInsurer;
  } catch (e) {
    Logger.log.error('Error occurred in identify insurer ', e.message || e);
  }
};

const identifyReport = async ({ matrix, creditLimit, reportType, country }) => {
  try {
    let identifiedPriceRange;
    let lowerLimit;
    let upperLimit;
    for (let i = 0; i < matrix.priceRange.length; i++) {
      lowerLimit = matrix.priceRange[i].lowerLimit
        ? matrix.priceRange[i].lowerLimit
        : creditLimit;
      upperLimit = matrix.priceRange[i].upperLimit
        ? matrix.priceRange[i].upperLimit
        : creditLimit;
      if (lowerLimit <= creditLimit && upperLimit >= creditLimit) {
        identifiedPriceRange = matrix.priceRange[i];
        break;
      }
    }
    console.log('identifiedPriceRange', identifiedPriceRange);
    const identifiedReportDetails =
      reportType === 'individual'
        ? identifiedPriceRange.australianIndividuals
        : country === 'AUS'
        ? identifiedPriceRange.australianCompanies
        : identifiedPriceRange.newZealand;
    let reportCode;
    if (identifiedReportDetails.reports.length === 1) {
      for (let i = 0; i < reports.length; i++) {
        if (identifiedReportDetails.reports[0].includes(reports[i].name)) {
          reportCode = reports[i].code;
          break;
        }
      }
    } else {
      //TODO change for multiple reports
      for (let i = 0; i < identifiedReportDetails.reports.length; i++) {
        for (let j = 0; j < reports.length; j++) {
          if (identifiedReportDetails.reports[i].includes(reports[j].name)) {
            reportCode = reports[j].code;
            break;
          }
        }
      }
    }
    return { identifiedPriceRange, identifiedReportDetails, reportCode };
  } catch (e) {
    Logger.log.error('Error occurred in identify report ', e);
  }
};

const getReportData = async ({ entityType, type, debtor, reportCode }) => {
  try {
    let reportData;
    let reportEntityType = 'debtor';
    console.log('reportCode', reportCode);
    if (type === 'individual') {
      //TODO add for euifax
    } else if (type === 'company' && reportCode) {
      let abnNumber = debtor.abn;
      let debtorId = debtor._id;
      if (entityType === 'TRUST') {
        const stakeHolder = await DebtorDirector.findOne({
          debtorId: debtor._id,
        }).lean();
        abnNumber = stakeHolder.abn;
        debtorId = stakeHolder._id;
        reportEntityType = 'debtor-director';
      }
      reportData = await CreditReport.findOne({
        isDeleted: false,
        isExpired: false,
        entityId: debtorId,
        productCode: reportCode,
        expiryDate: { $gt: new Date() },
      });
      reportData =
        reportData && reportData.creditReport ? reportData.creditReport : null;
      if (!reportData) {
        const reportCodes = {
          HXBCA: ['HXPAA', 'HXPYA'],
          HXPYA: ['HXPAA'],
        };
        if (reportCodes[reportCode] && reportCodes[reportCode].length !== 0) {
          reportData = await CreditReport.findOne({
            isDeleted: false,
            isExpired: false,
            entityId: debtorId,
            productCode: { $in: reportCodes[reportCode] },
            expiryDate: { $gt: new Date() },
          });
        }
        reportData =
          reportData && reportData.creditReport
            ? reportData.creditReport
            : null;
      }
      console.log('abnNumber :: ', abnNumber);
      if (!reportData) {
        reportData = await fetchCreditReport({
          productCode: reportCode,
          searchField: 'ABN',
          searchValue: abnNumber,
        });
        console.log('HERE:::::::::::::::::::::::::');
        console.log('Report DATA', JSON.stringify(reportData, null, 3));
        //TODO don't store failed report data
        if (
          reportData &&
          reportData.Envelope.Body.Response &&
          reportData.Envelope.Body.Response.Messages.ErrorCount &&
          parseInt(reportData.Envelope.Body.Response.Messages.ErrorCount) === 0
        ) {
          await storeReportData({
            debtorId: debtorId,
            productCode: reportCode,
            reportFrom: 'illion',
            reportName: reportData.Envelope.Body.Response.Header.ProductName,
            reportData: reportData.Envelope.Body.Response,
            entityType: reportEntityType,
          });
          reportData = reportData.Envelope.Body.Response;
          if (
            reportData.DynamicDelinquencyScore &&
            reportData.DynamicDelinquencyScore &&
            reportData.DynamicDelinquencyScore.Score
          ) {
            await Debtor.updateOne(
              { _id: debtor._id },
              { riskRating: reportData.DynamicDelinquencyScore.Score },
            );
          }
        } else if (
          reportData &&
          reportData.Envelope.Body.Response &&
          reportData.Envelope.Body.Response.Messages.ErrorCount &&
          parseInt(reportData.Envelope.Body.Response.Messages.ErrorCount) !== 0
        ) {
          reportData = null;
        }
      }
      return reportData;
    }
  } catch (e) {
    Logger.log.error('Error occurred in get report data ', e);
  }
};

const insurerQBE = async ({ application, type }) => {
  try {
    console.log('report for :', type);
    let blockers = [];
    let response;
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
    } = await identifyReport({
      matrix: qbe,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    console.log('report code ', reportCode);
    console.log('identifiedReportDetails ', identifiedReportDetails);
    if (!reportCode) {
      blockers.push('Unable to get report code');
    }
    const [reportData, entityData] = await Promise.all([
      getReportData({
        type,
        reportCode,
        entityType: application.debtorId.entityType,
        debtor: application.debtorId,
      }),
      getEntityDetailsByABN({ searchString: application.debtorId.abn }),
    ]);
    if (!reportData) {
      blockers.push('Unable to generate a report');
    }
    console.log('NEXT STEP ::::::::: ');
    console.log('reportData', reportData);
    console.log('entityData', JSON.stringify(entityData, null, 2));
    blockers = await checkGuidelines({
      guidelines: qbe.generalTerms,
      application,
      entityData: entityData.response.businessEntity202001,
      reportData: reportData ? reportData : null,
      blockers,
    });
    blockers = await checkPriceRangeGuidelines({
      guidelines: identifiedReportDetails.guideLines,
      reportData: reportData ? reportData : null,
      blockers,
    });
    console.log('blockers', blockers);
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer QBE ', e);
  }
};

const insurerBond = async ({ application, type }) => {
  try {
    console.log('report for :', type);
    let blockers = [];
    let response;
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
    } = await identifyReport({
      matrix: bond,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    console.log('report code ', reportCode);
    console.log('identifiedReportDetails ', identifiedReportDetails);
    if (!reportCode) {
      blockers.push('Unable to get report code');
    }
    const [reportData, entityData] = await Promise.all([
      getReportData({
        type,
        reportCode,
        entityType: application.debtorId.entityType,
        debtor: application.debtorId,
      }),
      getEntityDetailsByABN({ searchString: application.debtorId.abn }),
    ]);
    if (!reportData) {
      blockers.push('Unable to generate a report');
    }
    console.log('NEXT STEP ::::::::: ');
    console.log('reportData', reportData);
    console.log('entityData', JSON.stringify(entityData, null, 2));
    blockers = await checkGuidelines({
      guidelines: qbe.generalTerms,
      application,
      entityData: entityData.response.businessEntity202001,
      reportData: reportData ? reportData : null,
      blockers,
    });
    blockers = await checkPriceRangeGuidelines({
      guidelines: identifiedReportDetails.guideLines,
      reportData: reportData ? reportData : null,
      blockers,
    });
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Bond ', e);
  }
};

const insurerAtradius = async ({ application, type }) => {
  try {
    console.log('report for :', type);
    let blockers = [];
    let response;
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
    } = await identifyReport({
      matrix: atradius,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    console.log('report code ', reportCode);
    console.log('identifiedReportDetails ', identifiedReportDetails);
    if (!reportCode) {
      blockers.push('Unable to get report code');
    }
    const [reportData, entityData] = await Promise.all([
      getReportData({
        type,
        reportCode,
        entityType: application.debtorId.entityType,
        debtor: application.debtorId,
      }),
      getEntityDetailsByABN({ searchString: application.debtorId.abn }),
    ]);
    if (!reportData) {
      blockers.push('Unable to generate a report');
    }
    console.log('NEXT STEP ::::::::: ');
    console.log('reportData', reportData);
    console.log('entityData', JSON.stringify(entityData, null, 2));
    blockers = await checkGuidelines({
      guidelines: qbe.generalTerms,
      application,
      entityData: entityData.response.businessEntity202001,
      reportData: reportData ? reportData : null,
      blockers,
    });
    blockers = await checkPriceRangeGuidelines({
      guidelines: identifiedReportDetails.guideLines,
      reportData: reportData ? reportData : null,
      blockers,
    });
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Atradius ', e);
  }
};

const insurerCoface = async ({ application, type }) => {
  try {
    console.log('report for :', type);
    let blockers = [];
    let response;
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
    } = await identifyReport({
      matrix: coface,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    console.log('report code ', reportCode);
    console.log('identifiedReportDetails ', identifiedReportDetails);
    if (!reportCode) {
      blockers.push('Unable to get report code');
    }
    const [reportData, entityData] = await Promise.all([
      getReportData({
        type,
        reportCode,
        entityType: application.debtorId.entityType,
        debtor: application.debtorId,
      }),
      getEntityDetailsByABN({ searchString: application.debtorId.abn }),
    ]);
    if (!reportData) {
      blockers.push('Unable to generate a report');
    }
    console.log('NEXT STEP ::::::::: ');
    console.log('reportData', reportData);
    console.log('entityData', JSON.stringify(entityData, null, 2));
    blockers = await checkGuidelines({
      guidelines: qbe.generalTerms,
      application,
      entityData: entityData.response.businessEntity202001,
      reportData: reportData ? reportData : null,
      blockers,
    });
    blockers = await checkPriceRangeGuidelines({
      guidelines: identifiedReportDetails.guideLines,
      reportData: reportData ? reportData : null,
      blockers,
    });
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Coface ', e);
  }
};

const insurerEuler = async ({ application, type }) => {
  try {
    console.log('report for :', type);
    let blockers = [];
    let response;
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
    } = await identifyReport({
      matrix: euler,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    console.log('report code ', reportCode);
    console.log('identifiedReportDetails ', identifiedReportDetails);
    if (!reportCode) {
      blockers.push('Unable to get report code');
    }
    const [reportData, entityData] = await Promise.all([
      getReportData({
        type,
        reportCode,
        entityType: application.debtorId.entityType,
        debtor: application.debtorId,
      }),
      getEntityDetailsByABN({ searchString: application.debtorId.abn }),
    ]);
    if (!reportData) {
      blockers.push('Unable to generate a report');
    }
    console.log('NEXT STEP ::::::::: ');
    console.log('reportData', reportData);
    console.log('entityData', JSON.stringify(entityData, null, 2));
    blockers = await checkGuidelines({
      guidelines: qbe.generalTerms,
      application,
      entityData: entityData.response.businessEntity202001,
      reportData: reportData ? reportData : null,
      blockers,
    });
    blockers = await checkPriceRangeGuidelines({
      guidelines: identifiedReportDetails.guideLines,
      reportData: reportData ? reportData : null,
      blockers,
    });
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Euler ', e);
  }
};

const insurerTrad = async ({ application, type }) => {
  try {
    console.log('report for :', type);
    let blockers = ['RMP only insurer'];
    let response;
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
    } = await identifyReport({
      matrix: trad,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    console.log('report code ', reportCode);
    console.log('identifiedReportDetails ', identifiedReportDetails);
    if (!reportCode) {
      blockers.push('Unable to get report code');
    }
    const [reportData, entityData] = await Promise.all([
      getReportData({
        type,
        reportCode,
        entityType: application.debtorId.entityType,
        debtor: application.debtorId,
      }),
      getEntityDetailsByABN({ searchString: application.debtorId.abn }),
    ]);
    if (!reportData) {
      blockers.push('Unable to generate a report');
    }
    console.log('NEXT STEP ::::::::: ');
    console.log('reportData', reportData);
    console.log('entityData', JSON.stringify(entityData, null, 2));
    blockers = await checkGuidelines({
      guidelines: qbe.generalTerms,
      application,
      entityData: entityData.response.businessEntity202001,
      reportData: reportData ? reportData : null,
      blockers,
    });
    blockers = await checkPriceRangeGuidelines({
      guidelines: identifiedReportDetails.guideLines,
      reportData: reportData ? reportData : null,
      blockers,
    });
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Trad ', e);
  }
};

const checkForEntityRegistration = async ({
  entityStatus,
  entityType,
  applicationEntityType,
}) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (entityType && entityType.entityDescription) {
      const type = await resolveEntityType({
        entityType: entityType.entityDescription,
      });
      if (type !== applicationEntityType) {
        response.isBlocker = true;
      }
    }
    if (entityStatus && entityStatus.effectiveTo) {
      if (entityStatus.effectiveTo !== '0001-01-01') {
        response.isBlocker = true;
      }
    } else if (entityStatus && entityStatus.length !== 0) {
      const entityRegistration = entityStatus.find((i) => {
        if (i.effectiveTo === '0001-01-01') {
          return i;
        }
      });
      console.log('entityRegistration ', entityRegistration);
      if (!entityRegistration) {
        response.isBlocker = true;
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for entity registration ', e);
  }
};

const checkForNilCreditLimitIssues = async ({ debtorId }) => {
  try {
    const response = {
      isBlocker: false,
    };
    const applications = await Application.find({
      debtorId: debtorId,
      status: 'SURRENDERED',
    }).lean();
    if (applications.length !== 0) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for nil credit limit ', e);
  }
};

const checkForGSTRegistration = async ({ goodsAndServicesTax }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (goodsAndServicesTax && goodsAndServicesTax.effectiveTo) {
      if (goodsAndServicesTax.effectiveTo !== '0001-01-01') {
        response.isBlocker = true;
      }
    } else if (goodsAndServicesTax && goodsAndServicesTax.length !== 0) {
      const entityGSTRegistration = goodsAndServicesTax.find((i) => {
        if (i.effectiveTo === '0001-01-01') {
          return i;
        }
      });
      console.log('entityGSTRegistration ', entityGSTRegistration);
      if (!entityGSTRegistration) {
        response.isBlocker = true;
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for gst registration ', e);
  }
};

//TODO make dynamic
const checkForEntityIncorporated = async ({ entityStatus, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    let today = new Date();
    today = today.setMonth(today.getMonth() - value);
    const yearBefore = new Date(today);
    if (
      entityStatus &&
      entityStatus.entityStatusCode &&
      entityStatus.effectiveTo &&
      entityStatus.effectiveFrom
    ) {
      if (
        new Date(entityStatus.effectiveFrom) > yearBefore ||
        entityStatus.entityStatusCode.toLowerCase() !== 'active'
      ) {
        response.isBlocker = true;
      }
    } else if (entityStatus && entityStatus.length !== 0) {
      const entityRegistration = entityStatus.find((i) => {
        if (i.effectiveTo === '0001-01-01') {
          return i;
        }
      });
      console.log('entityRegistration ', entityRegistration);
      if (
        new Date(entityRegistration.effectiveFrom) > yearBefore ||
        entityRegistration.entityStatusCode.toLowerCase() !== 'active'
      ) {
        response.isBlocker = true;
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for entity incorporation ', e);
  }
};

const checkForCourtAction = async ({
  summaryInformation,
  value,
  courtActionsSummary,
}) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (parseInt(summaryInformation.CourtActionsCount) >= 1) {
      response.isBlocker = true;
    } else if (parseInt(summaryInformation.CollectionsCount) >= 1) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurre in check for court action ', e);
  }
};

const checkForNoAdverse = async ({ summaryInformation }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (
      parseInt(summaryInformation.DirectorCourtActionCount) >= 1 ||
      parseInt(summaryInformation.DirectorFailedBusinessesCount) >= 1
    ) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurre in check for court action ', e);
  }
};

const checkForRegisteredCharges = async ({ summaryInformation }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (parseInt(summaryInformation.RegisteredChargesCount) >= 1) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for registered charges ', e);
  }
};

//TODO verify minimum of 3 trade references - 3 separate suppliers + make dynamic
const checkForTradeReferences = async ({ summaryInformation, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (summaryInformation.TradeReferencesCount < value) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for trade reference ', e);
  }
};

//TODO make dynamic
const checkForRiskLevel = async ({ dynamicDelinquencyScore, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (value.includes(dynamicDelinquencyScore.RiskLevel)) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for risk level ', e);
  }
};

//TODO make dynamic
const checkForRiskScore = async ({ dynamicDelinquencyScore, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (dynamicDelinquencyScore.Score < value) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for risk level ', e);
  }
};

const checkGuidelines = async ({
  guidelines,
  application,
  entityData,
  reportData,
  blockers,
}) => {
  try {
    let response = {};
    if (guidelines.isEntityRegistered) {
      if (
        entityData &&
        entityData.entityType &&
        entityData.entityStatus &&
        application.debtorId.entityType
      ) {
        response = await checkForEntityRegistration({
          entityType: entityData.entityType,
          entityStatus: entityData.entityStatus,
          applicationEntityType: application.debtorId.entityType,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Legal entity is incorrect or company is not registered');
      }
    }
    if (guidelines.noNilCreditLimitIssued) {
      response = await checkForNilCreditLimitIssues({
        debtorId: application.debtorId._id,
      });
      if (response.isBlocker) {
        blockers.push('Other insurers have issued a NIL credit limit');
      }
    }
    if (guidelines.checkForGSTRegistration) {
      if (entityData && entityData.goodsAndServicesTax) {
        response = await checkForGSTRegistration({
          goodsAndServicesTax: entityData.goodsAndServicesTax,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Entity is not registered for GST');
      }
    }
    if (guidelines.entityIncorporated) {
      if (entityData && entityData.entityStatus) {
        response = await checkForEntityIncorporated({
          entityStatus: entityData.entityStatus,
          value: guidelines.entityIncorporated.value,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Company is incorporated in last 12 months');
      }
    }
    if (guidelines.courtCharges) {
      if (reportData && reportData.SummaryInformation) {
        response = await checkForCourtAction({
          summaryInformation: reportData.SummaryInformation,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Court actions or legal or collection activity present');
      }
    }
    if (guidelines.courtChargesWithMinMaxAmount) {
      if (reportData && reportData.SummaryInformation) {
        response = await checkForCourtAction({
          summaryInformation: reportData.SummaryInformation,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push(
          'Court actions or legal or collection activity present above a maximum of $5,000 on a Limit up to $50,000',
        );
      }
    }
    if (guidelines.courtChargesWithAmount) {
      if (reportData && reportData.SummaryInformation) {
        response = await checkForCourtAction({
          summaryInformation: reportData.SummaryInformation,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push(
          'Court actions or legal or collection activity present above a maximum of $5,000',
        );
      }
    }
    if (guidelines.noAdverse) {
      if (reportData && reportData.SummaryInformation) {
        response = await checkForNoAdverse({
          summaryInformation: reportData.SummaryInformation,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Adverse against director/s, owner/s or Shareholders');
      }
    }
    if (guidelines.noRegisteredCharges) {
      if (reportData && reportData.SummaryInformation) {
        response = await checkForRegisteredCharges({
          summaryInformation: reportData.SummaryInformation,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Related party registered charges');
      }
    }
    if (
      guidelines.soleTraderRegisteredForGST &&
      application.debtorId.entityType === 'SOLE_TRADER'
    ) {
      if (entityData && entityData.goodsAndServicesTax) {
        response = await checkForGSTRegistration({
          goodsAndServicesTax: entityData.goodsAndServicesTax,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker || !reportData) {
        blockers.push('Sole Trader is not registered for GST');
      }
    }
    if (
      guidelines.soleTraderNotRegistered &&
      application.debtorId.entityType === 'SOLE_TRADER'
    ) {
      if (response.isBlocker) {
        blockers.push(guidelines.soleTraderNotRegistered.conditionString);
      }
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in check guidelines ', e);
  }
};

const checkPriceRangeGuidelines = async ({
  guidelines,
  reportData,
  blockers,
}) => {
  try {
    let response = {};
    if (guidelines.paymentRiskLevel) {
      if (reportData && reportData.DynamicDelinquencyScore) {
        response = await checkForRiskLevel({
          dynamicDelinquencyScore: reportData.DynamicDelinquencyScore,
          value: guidelines.paymentRiskLevel.value,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push(
          'The Late Payment Risk Level indicated by D&B is “High” / “Very High” / “Severe”',
        );
      }
    }
    if (guidelines.delinquencyScore) {
      if (reportData && reportData.DynamicDelinquencyScore) {
        response = await checkForRiskScore({
          dynamicDelinquencyScore: reportData.DynamicDelinquencyScore,
          value: guidelines.delinquencyScore.value,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('The D&B Dynamic Delinquency Score is lower than 386');
      }
    }
    if (guidelines.tradePaymentInfo) {
      blockers.push(
        'Trade payment info is not included in the mercantile report',
      );
    }
    /*if (guidelines.enquireUnderwriter) {
      blockers.push(guidelines.enquireUnderwriter.conditionString);
    }
    if (guidelines.noRecommendation) {
      blockers.push(guidelines.noRecommendation.conditionString);
    }
    if (guidelines.recommendation) {
      blockers.push(guidelines.recommendation.conditionString);
    }
    if (guidelines.approvedOrDeclines) {
      blockers.push(guidelines.approvedOrDeclines.conditionString);
    }*/
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in check price range guidelines ', e);
  }
};

const storeReportData = async ({
  debtorId,
  reportFrom,
  reportName,
  productCode,
  reportData,
  entityType,
}) => {
  try {
    const date = new Date();
    const expiryDate = new Date(date.setMonth(date.getMonth() + 12));
    const response = await CreditReport.create({
      entityId: debtorId,
      entityType,
      reportProvider: reportFrom,
      productCode,
      name: reportName,
      expiryDate,
      creditReport: reportData,
    });
    // console.log('response ', response);
  } catch (e) {
    Logger.log.error('Error occurred in store report data ', e);
  }
};

module.exports = {
  checkEntityType,
  identifyInsurer,
  insurerQBE,
  insurerBond,
  insurerAtradius,
  insurerCoface,
  insurerEuler,
  insurerTrad,
};
