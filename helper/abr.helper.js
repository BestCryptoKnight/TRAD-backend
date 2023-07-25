/*
 * Module Imports
 * */
const axios = require('axios');
const parser = require('xml2json');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticData = require('./../static-files/staticData.json');

const getEntityDetailsByABN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.abn': 1 })
      .lean();
    const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
    const options = {
      method: 'GET',
      url: url,
    };
    const { data } = await axios(options);
    let jsonData = parser.toJson(data);
    jsonData = JSON.parse(jsonData);
    return jsonData.ABRPayloadSearchResults;
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN');
    Logger.log.error(e.message || e);
  }
};

const getEntityDetailsByACN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.abn': 1 })
      .lean();
    const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByASICv201408?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
    const options = {
      method: 'GET',
      url: url,
    };
    const { data } = await axios(options);
    let jsonData = parser.toJson(data);
    jsonData = JSON.parse(jsonData);
    return jsonData.ABRPayloadSearchResults;
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN lookup ');
    Logger.log.error(e.message || e);
  }
};

const getEntityListByName = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.abn': 1 })
      .lean();
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
    <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
    <soap12:Body>
    <ABRSearchByNameSimpleProtocol xmlns="http://abr.business.gov.au/ABRXMLSearch/">
    <name>${searchString}</name>
    <legalName>Y</legalName>
    <tradingName>Y</tradingName>
    <NSW>Y</NSW>\n<SA>Y</SA>\n<ACT>Y</ACT>\n<VIC>Y</VIC>\n<WA>Y</WA>\n<NT>Y</NT>\n<QLD>Y</QLD>\n<TAS>Y</TAS>
    <authenticationGuid>${organization.integration.abn.guid}</authenticationGuid>
    </ABRSearchByNameSimpleProtocol>
    </soap12:Body>
    </soap12:Envelope>`;
    const options = {
      method: 'post',
      url: 'https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      data: requestBody,
    };
    const { data } = await axios(options);
    let jsonData = parser.toJson(data);
    jsonData = JSON.parse(jsonData);
    return jsonData['soap:Envelope']['soap:Body'][
      'ABRSearchByNameSimpleProtocolResponse'
    ];
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN lookup ');
    Logger.log.error(e.message || e);
  }
};

const resolveEntityType = async ({ entityType, country }) => {
  try {
    if (country === 'AUS') {
      const entityTypesFromABR = StaticData.ABREntityType;
      for (let i = 0; i < entityTypesFromABR.length; i++) {
        if (entityTypesFromABR[i].name === entityType) {
          entityType = entityTypesFromABR[i]._id;
          break;
        }
      }
    } else {
      const entityTypesFromNZBN = StaticData.NZEntityType;
      for (let i = 0; i < entityTypesFromNZBN.length; i++) {
        if (entityTypesFromNZBN[i].name === entityType) {
          entityType = entityTypesFromNZBN[i]._id;
          break;
        }
      }
    }
    return entityType;
  } catch (e) {
    Logger.log.error('Error occurred in resolve entity type ', e.message || e);
  }
};

const getEntityListByNameFromNZBN = async ({
  searchString,
  page = 0,
  limit = 200,
}) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.nzbn': 1 })
      .lean();
    const url = `https://api.business.govt.nz/gateway/nzbn/v5/entities?search-term=${searchString}&page-size=${limit}&page=${page}`;
    const options = {
      method: 'GET',
      url: url,
      headers: {
        'Ocp-Apim-Subscription-Key': organization.integration.nzbn.accessToken,
      },
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error in getting entity list from NZBN lookup ');
    Logger.log.error(e.message || e);
  }
};

const getEntityDetailsByNZBN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.nzbn': 1 })
      .lean();
    const url = `https://api.business.govt.nz/gateway/nzbn/v5/entities/${searchString}`;
    const options = {
      method: 'GET',
      url: url,
      headers: {
        'Ocp-Apim-Subscription-Key': organization.integration.nzbn.accessToken,
      },
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error in getting entity details from NZBN lookup');
    Logger.log.error(e.response.data || e);
    if (
      e.response &&
      e.response.data &&
      parseInt(e.response.data.status) === 503 &&
      e.response.data.errorDescription
    ) {
      return Promise.reject({
        status: 'ERROR',
        messageCode: 'SERVICE_UNAVAILABLE',
        message: 'NZ lookup error: ' + e.response.data.errorDescription,
      });
    } else if (
      e.response &&
      e.response.data &&
      parseInt(e.response.data.status) === 500 &&
      e.response.data.errorDescription
    ) {
      return Promise.reject({
        status: 'ERROR',
        messageCode: 'UPSTREAM_SERVICE_ERROR',
        message: 'NZ lookup error: ' + e.response.data.errorDescription,
      });
    } else if (
      e.response &&
      e.response.data &&
      e.response.data.errorDescription
    ) {
      return Promise.reject({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'NZ lookup error: ' + e.response.data.errorDescription,
      });
    } else {
      return Promise.reject({
        status: 'ERROR',
        message: e.message || e,
      });
    }
  }
};

const extractABRLookupData = async ({
  entityData,
  country,
  step,
  isForACNOnly = false,
  searchString,
}) => {
  try {
    let response = {};
    if (entityData && entityData.response) {
      const entityDetails =
        entityData.response.businessEntity202001 ||
        entityData.response.businessEntity201408;
      if (entityDetails) {
        if (entityDetails.entityType) {
          const entityType = await resolveEntityType({
            entityType: entityDetails.entityType.entityDescription,
            country,
          });
          if (step && step.toLowerCase() === 'person') {
            const entityTypes = [
              'PROPRIETARY_LIMITED',
              'LIMITED',
              'CORPORATION',
              'INCORPORATED',
              'NO_LIABILITY',
              'PROPRIETARY',
              'REGISTERED_BODY',
            ];
            if (!entityTypes.includes(entityType)) {
              return {
                status: 'ERROR',
                messageCode: 'INVALID_ENTITY_TYPE',
                message: 'Invalid entity type',
              };
            }
          }
          response.entityType = {
            label: entityType
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (txt) {
                return (
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                );
              }),
            value: entityType,
          };
        }
        if (entityDetails.ABN) response.abn = entityDetails.ABN.identifierValue;
        if (entityDetails.entityStatus) {
          if (
            entityDetails.entityStatus.effectiveFrom &&
            entityDetails.entityStatus.entityStatusCode
          ) {
            response.registeredDate = entityDetails.entityStatus.effectiveFrom;
            response.isActive = entityDetails.entityStatus.entityStatusCode;
          } else if (entityDetails.entityStatus.length !== 0) {
            const entityRegistration = entityDetails.entityStatus.find((i) => {
              if (i.effectiveTo === '0001-01-01') {
                return i;
              }
            });
            if (entityRegistration) {
              response.registeredDate = entityRegistration.effectiveFrom;
              response.isActive = entityRegistration.entityStatusCode;
            }
          }
        }
        if (entityDetails.ASICNumber)
          response.acn =
            typeof entityDetails.ASICNumber === 'string'
              ? entityDetails.ASICNumber
              : '';
        if (entityDetails.goodsAndServicesTax)
          response.gstStatus = entityDetails.goodsAndServicesTax.effectiveFrom;
        if (entityDetails.mainName)
          response.entityName = {
            label: Array.isArray(entityDetails.mainName)
              ? entityDetails.mainName[0].organisationName
              : entityDetails.mainName.organisationName,
            value: Array.isArray(entityDetails.mainName)
              ? entityDetails.mainName[0].organisationName
              : entityDetails.mainName.organisationName,
          };
        const tradingName =
          entityDetails.mainTradingName || entityDetails.businessName;
        if (tradingName)
          response.tradingName =
            tradingName.organisationName ||
            typeof tradingName.organisationName === 'string'
              ? tradingName.organisationName
              : tradingName[0].organisationName;
        if (
          entityDetails.mainBusinessPhysicalAddress[0] &&
          typeof entityDetails.mainBusinessPhysicalAddress[0].stateCode ===
            'string'
        ) {
          const state = StaticData.australianStates.find((i) => {
            if (
              i._id === entityDetails.mainBusinessPhysicalAddress[0].stateCode
            )
              return i;
          });
          response.state = {
            label:
              state && state.name
                ? state.name
                : entityDetails.mainBusinessPhysicalAddress[0].stateCode,
            value: entityDetails.mainBusinessPhysicalAddress[0].stateCode,
          };
        }
        if (
          entityDetails.mainBusinessPhysicalAddress[0] &&
          typeof entityDetails.mainBusinessPhysicalAddress[0]?.postcode ===
            'string'
        ) {
          response.postCode =
            entityDetails.mainBusinessPhysicalAddress[0].postcode;
        }
      } else {
        if (isForACNOnly) {
          response = {
            acn: searchString,
          };
        } else {
          return {
            status: 'ERROR',
            messageCode: 'NO_DATA_FOUND',
            message: 'No data found',
          };
        }
      }
    } else {
      return {
        status: 'ERROR',
        messageCode: 'NO_DATA_FOUND',
        message: 'No data found',
      };
    }
    return response;
  } catch (e) {
    Logger.log.error('Error in extract ABR lookup data');
    Logger.log.error(e.message || e);
  }
};

const extractABRLookupDataFromArray = async ({ entityList }) => {
  try {
    let response = [];
    let entityData = {};
    if (
      entityList &&
      entityList.ABRPayloadSearchResults.response &&
      entityList.ABRPayloadSearchResults.response.searchResultsList &&
      entityList.ABRPayloadSearchResults.response.searchResultsList
        .searchResultsRecord &&
      entityList.ABRPayloadSearchResults.response.searchResultsList
        .searchResultsRecord.length !== 0
    ) {
      const entities = Array.isArray(
        entityList.ABRPayloadSearchResults.response.searchResultsList
          .searchResultsRecord,
      )
        ? entityList.ABRPayloadSearchResults.response.searchResultsList
            .searchResultsRecord
        : [
            entityList.ABRPayloadSearchResults.response.searchResultsList
              .searchResultsRecord,
          ];
      entities.forEach((data) => {
        entityData = {};
        if (
          data.ABN &&
          data.ABN.identifierStatus &&
          data.ABN.identifierStatus.toLowerCase() !== 'cancelled'
        ) {
          if (data.ABN) entityData.abn = data.ABN.identifierValue;
          if (data.ABN) entityData.status = data.ABN.identifierStatus;
          let fieldName =
            data.mainName ||
            data.businessName ||
            data.otherTradingName ||
            data.mainTradingName;
          if (fieldName) {
            entityData.label = fieldName.organisationName;
            entityData.value = fieldName.organisationName;
          }
          if (data.mainBusinessPhysicalAddress) {
            entityData.state =
              typeof data.mainBusinessPhysicalAddress.stateCode === 'string'
                ? data.mainBusinessPhysicalAddress.stateCode
                : '';
            entityData.postCode = data.mainBusinessPhysicalAddress.postcode;
          }
          response.push(entityData);
        }
      });
    }
    return response;
  } catch (e) {
    Logger.log.error('Error in extract ABR lookup data');
    Logger.log.error(e.message || e);
  }
};

//TODO send entity-type after entity type mapping
const extractNZBRLookupData = async ({ entityData, country, step }) => {
  try {
    let response = {};
    const inActiveCode = ['62', '80', '90', '91'];
    if (entityData && entityData.nzbn) {
      if (entityData.entityTypeCode) {
        const entityType = await resolveEntityType({
          entityType: entityData.entityTypeCode,
          country,
        });
        if (step && step.toLowerCase() === 'person') {
          const entityTypes = [
            'PROPRIETARY_LIMITED',
            'LIMITED',
            'CORPORATION',
            'INCORPORATED',
            'NO_LIABILITY',
            'PROPRIETARY',
            'REGISTERED_BODY',
          ];
          if (!entityTypes.includes(entityType)) {
            return {
              status: 'ERROR',
              messageCode: 'INVALID_ENTITY_TYPE',
              message: 'Invalid entity type',
            };
          }
        }
        response.entityType = {
          label: entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }),
          value: entityType,
        };
      }
      if (entityData.nzbn) {
        response.abn = entityData.nzbn;
      }
      if (entityData.entityName) {
        response.entityName = {
          label: entityData.entityName,
          value: entityData.entityName,
        };
      }
      if (entityData.entityStatusCode) {
        response.isActive = !inActiveCode.includes(entityData.entityStatusCode);
      }
      if (entityData.entityStatusDescription) {
        response.status = entityData.entityStatusDescription;
      }
      if (
        entityData.sourceRegisterUniqueIdentifier ||
        entityData.sourceRegisterUniqueId
      ) {
        response.acn =
          entityData.sourceRegisterUniqueIdentifier ||
          entityData.sourceRegisterUniqueId;
      }
      if (entityData.tradingNames) {
        if (
          Array.isArray(entityData.tradingNames) &&
          entityData.tradingNames.length !== 0
        ) {
          response.tradingName = entityData.tradingNames[0]['name'];
        }
      }
      if (entityData.addresses && entityData.addresses.addressList) {
        const addressList = entityData.addresses.addressList;
        if (Array.isArray(addressList) && addressList.length !== 0) {
          let address = {};
          for (let i = 0; i < addressList.length; i++) {
            if (addressList[i].addressType === 'REGISTERED') {
              address = addressList[i];
              break;
            }
          }
          if (address) {
            let state;
            if (address.address3 || address.address4) {
              state = StaticData.newZealandStates.find((i) => {
                if (
                  address.address3 &&
                  address.address3.toLowerCase().includes(i.name.toLowerCase())
                ) {
                  return i;
                } else if (
                  address.address4 &&
                  address.address4.toLowerCase().includes(i.name.toLowerCase())
                ) {
                  return i;
                }
              });
            }
            if (address.address1) {
              response.property = address.address1;
            }
            if (address.address2) {
              response.streetName = address.address2;
            }
            if (address.address3) {
              response.suburb = address.address3;
            }
            if (state && state._id) {
              response.state = {
                label: state.name,
                value: state._id,
              };
            }
            if (address.postCode) {
              response.postCode = address.postCode;
            }
          }
        }
      }
      if (entityData.phoneNumbers) {
        if (
          Array.isArray(entityData.phoneNumbers) &&
          entityData.phoneNumbers.length !== 0
        ) {
          response.contactNumber =
            entityData.phoneNumbers[0]['phoneCountryCode'] +
            entityData.phoneNumbers[0]['phoneNumber'];
        }
      }
    } else {
      return {
        status: 'ERROR',
        messageCode: 'NO_DATA_FOUND',
        message: 'No data found',
      };
    }
    return response;
  } catch (e) {
    Logger.log.error('Error in extract NZBN lookup data');
    Logger.log.error(e.message || e);
  }
};

//TODO send entity-type after entity type mapping
const extractNZBRLookupDataFromArray = async ({
  entityList,
  step,
  country,
}) => {
  try {
    let responseArray = [];
    let response = {};
    const isForPersonStep = step === 'person';
    const inActiveCode = ['62', '80', '90', '91'];
    if (entityList && entityList.items && entityList.items.length !== 0) {
      entityList.items.forEach((entityData) => {
        response = {};
        if (
          entityData.entityStatusCode &&
          !inActiveCode.includes(entityData.entityStatusCode)
        ) {
          if (entityData.nzbn) response.abn = entityData.nzbn;
          if (entityData.entityName) {
            response.label = entityData.entityName;
            response.value = entityData.entityName;
          }
          if (entityData.entityStatusDescription)
            response.status = entityData.entityStatusDescription;
          if (entityData.sourceRegisterUniqueId) {
            response.acn = entityData.sourceRegisterUniqueId;
          }
          if (isForPersonStep && entityData.entityTypeCode) {
            const entityTypeCodes = [
              'COOP',
              'NZCompany',
              'ASIC',
              'NON_ASIC',
              'OverseasCompany',
              'Sole_Trader',
              'PARTNERSHIP',
              'Trading_Trust',
              'T',
              'B',
              'D',
              'F',
              'I',
              'N',
              'Y',
              'Z',
              'S',
              'GovtCentral',
              'GovtLocal',
              'GovtEdu',
              'GovtOther',
            ];
            if (!entityTypeCodes.includes(entityData.entityTypeCode)) {
              responseArray.push(response);
            }
          } else {
            responseArray.push(response);
          }
        }
      });
    }
    return responseArray;
  } catch (e) {
    Logger.log.error('Error in extract NZBR lookup data');
    Logger.log.error(e.message || e);
  }
};

const getEntityDetailsByBusinessNumber = async ({
  searchString,
  country,
  step,
}) => {
  try {
    let responseData = {};
    let entityData;
    if (country === 'AUS') {
      if (
        searchString.toString().length >= 9 &&
        searchString.toString().length < 10
      ) {
        entityData = await getEntityDetailsByACN({
          searchString: searchString,
        });
        responseData = await extractABRLookupData({
          entityData,
          country,
          step,
          isForACNOnly: true,
          searchString,
        });
      } else {
        entityData = await getEntityDetailsByABN({
          searchString: searchString,
        });
        responseData = await extractABRLookupData({
          entityData,
          country,
          step,
        });
      }
    } else if (country === 'NZL') {
      if (searchString.toString().length < 12) {
        entityData = await getEntityListByNameFromNZBN({
          searchString: searchString,
        });
        let identifiedData = {};
        if (entityData && entityData.items && entityData.items.length !== 0) {
          for (let i = 0; i < entityData.items.length; i++) {
            if (
              entityData.items[i].sourceRegisterUniqueId &&
              entityData.items[i].sourceRegisterUniqueId === searchString
            ) {
              identifiedData = entityData.items[i];
              break;
            }
          }
        }
        responseData = await extractNZBRLookupData({
          entityData: identifiedData,
          country,
          step,
        });
      } else {
        entityData = await getEntityDetailsByNZBN({
          searchString: searchString,
        });
        if (entityData && entityData.status !== 'ERROR') {
          responseData = await extractNZBRLookupData({
            entityData,
            country,
            step,
          });
        } else {
          responseData = entityData;
        }
      }
    }
    return responseData;
  } catch (e) {
    Logger.log.error(
      'Error in get entity details using business/company number',
    );
    Logger.log.error(e.message || e);
  }
};

const getEntityDetailsByName = async ({
  searchString,
  country,
  page = 0,
  step,
}) => {
  try {
    let responseData;
    let entityData;
    if (country === 'AUS') {
      entityData = await getEntityListByName({
        searchString: searchString,
      });
      responseData = await extractABRLookupDataFromArray({
        entityList: entityData,
      });
    } else if (country === 'NZL') {
      entityData = await getEntityListByNameFromNZBN({
        searchString: searchString,
        page: page,
      });
      responseData = await extractNZBRLookupDataFromArray({
        entityList: entityData,
        country,
        step,
      });
    }
    return responseData;
  } catch (e) {
    Logger.log.error('Error in get entity details using name');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getEntityListByName,
  resolveEntityType,
  getEntityListByNameFromNZBN,
  getEntityDetailsByNZBN,
  getEntityDetailsByBusinessNumber,
  getEntityDetailsByName,
};
