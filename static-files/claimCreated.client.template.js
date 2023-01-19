/**
 * Config
 * */
const config = require('../config');
module.exports = ({
  clientName,
  nameOfServiceManagerOrRiskAnalyst,
  claimLink,
}) => {
  return `
Dear ${nameOfServiceManagerOrRiskAnalyst},<br/><br/>

I am writing to inform you that a new claim has been added on our risk management portal by one of our clients, ${clientName}.<br/><br/>

Please find the link to the claim below:<br/>
<a href="${claimLink}">Claims</a><br/><br/>

Please review the claim and take the necessary actions to manage the risk. <br/><br/>

Thank you for your attention to this matter.<br/><br/>

Cheers<br/><br/>

Trade Credit Risk Automation Bot<br/><br/>
  `;
};
