/**
 * Config
 * */
const config = require('../config');
module.exports = ({
  clientName,
  nameOfServiceManagerOrRiskAnalyst,
  claimLink,
  claimName,
}) => {
  return `
Dear ${nameOfServiceManagerOrRiskAnalyst},<br/><br/>

A new claim for ${claimName} has been lodged on the portal by client, ${clientName}.<br/><br/>

Please find link to the claim below:<br/>
<a href="${claimLink}">Claims</a><br/><br/>

Please review the claim and take necessary action.<br/><br/>

Thanks,<br/><br/>

PSC Trade Credit Risk Automation Bot.<br/><br/>
`;
};
