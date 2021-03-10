/**
 * Config
 * */
const config = require('../config');
module.exports = ({ name, setPasswordLink }) => {
  return `<html>
<head>
    <meta charset='utf-8'/>
    <meta name='viewport' content='width=device-width, initial-scale=1'/>
    <style>
        @font-face {
            font-family: "GoogleSans-Medium";
            src: local("GoogleSans-Medium"), url('https://client.trad.dev.gradlesol.com/app/fonts/GoogleSans-Medium.ttf') format("truetype");
            font-weight: normal;
        }

        @font-face {
            font-family: "GoogleSans-Regular";
            src: local("GoogleSans-Regular"), url('https://client.trad.dev.gradlesol.com/app/fonts/GoogleSans-Regular.ttf') format("truetype");
            font-weight: normal;
        }

        @font-face {
            font-family: "GoogleSans-Bold";
            src: local("GoogleSans-Bold"), url('https://client.trad.dev.gradlesol.com/app/fonts/GoogleSans-Bold.ttf') format("truetype");
            font-weight: normal;
        }

        body * {
            font-family: GoogleSans-Regular, SansSerif;
        }
    </style>
</head>
<body style='background-color: #F4F6F8; box-sizing: border-box'>
<table style='width: 100%;' cellpadding="40">
    <tr>
        <td align='center' valign='center' width="740"
            style="background-color: #F4F6F8;">
            <table width="740" cellspacing='0' cellpadding='0'
                   style="background-color: white; border-radius: 10px; box-shadow: 0px 0px 30px #BFBFBF29;">
                <tr>
                    <td width="100" height="32"
                        style="background-color: #003A78; border-top-left-radius: 10px; border-top-right-radius: 10px"></td>
                </tr>


                <tr>
                    <td align="center" valign="center" height="85" style="background-color: #F4F6F8;">
                        <img height="40" src="${config.server.backendServerUrl}mail-images/tcr-logo.png"/>
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center" width="100"
                        style="padding-top: 20px; font-size: 24px; font-family: GoogleSans-Medium; color: #003A78; background-color: white;">
                        Dear ${name}!
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center" width="100"
                        style="font-size: 38px; font-family: GoogleSans-Bold; color: #EF7B10; background-color: white;">
                        Welcome to TCR
                    </td>
                </tr>


                <tr>
                    <td align="center" valign="center" width="100"
                        style="padding: 3px 15%; font-size: 16px; font-family: GoogleSans-Medium; color: #37404D; background-color: white; opacity: .5">
                        We’re glad you’re here.
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center" width="80"
                        style="padding: 20px 5% 5px 5%; font-size: 24px; font-family: GoogleSans-Medium; color: #003A78; background-color: white">
                        We are glad to serve and decrease your financial risks.
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center" width="60"
                        style="padding: 5px 15%; font-size: 16px; line-height: 24px; font-family: GoogleSans-Regular; color: #828F9D; background-color: white">
                        Check out our client portal in detail and get daily updates for all your credit limits, claims
                        and debtor
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center"
                        style="padding: 10px 0 40px 0; background-color: white">
                        <a href="${setPasswordLink}" style="text-decoration: none;">
                            <button style="padding: 10px 20px; font-size: 16px; font-family: GoogleSans-Medium; color: white; background-color: #003A78; border-radius: 5px; border: none; outline: none; cursor: pointer">
                                Get Started!
                            </button>
                        </a>
                    </td>
                </tr>

                <tr>
                    <td>
                        <table width="100%" style="border-collapse: collapse">
                            <tr>
                                <td style="border-left: 0; vertical-align: top; padding: 20px; background-color: #F4F6F8;">
                                    <table>
                                        <tr>
                                            <td
                                                style="font-size: 16px; font-family: GoogleSans-Medium; color: #003A78">
                                                Service Manager
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table width="100%">
                                                    <tr>
                                                        <td style="padding: 3px 0">
                                                            <img height="18"
                                                                 src="${config.server.backendServerUrl}mail-images/user.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: #828F9D">
                                                           Hilmer Gwilym
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 3px 0">
                                                            <img height="16"
                                                                 src="${config.server.backendServerUrl}mail-images/call.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: #828F9D">
                                                            1234 420 581
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 3px 0">
                                                            <img height="18"
                                                                 src="${config.server.backendServerUrl}mail-images/mail.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: #828F9D">
                                                            hilmar@tradecreditrisk.com.au
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>

                                    </table>
                                </td>
                                <td style="border-left: 2px solid white; border-right: 2px solid white; vertical-align: top; padding: 20px; background-color: #F4F6F8;">
                                    <table>
                                        <tr>
                                            <td style="font-size: 16px; font-family: GoogleSans-Medium; color: #003A78">
                                                Risk Analyst
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table width="100%">
                                                    <tr>
                                                        <td style="padding: 3px 0">
                                                            <img height="18"
                                                                 src="${config.server.backendServerUrl}mail-images/user.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: #828F9D">
                                                            Jessica Grims
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 3px 0">
                                                            <img height="16"
                                                                 src="${config.server.backendServerUrl}mail-images/call.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: #828F9D">
                                                            1234 420 581
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 3px 0">
                                                            <img height="18"
                                                                 src="${config.server.backendServerUrl}mail-images/mail.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: #828F9D">
                                                            jess@tradecreditrisk.com.au
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>

                                    </table>
                                </td>
                                <td style="border-right: 0; vertical-align: top; padding: 20px; background-color: #F4F6F8;">
                                    <table>
                                        <tr>
                                            <td style="font-size: 16px; font-family: GoogleSans-Medium; color: #003A78">
                                                TRAD Support
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table width="100%">
                                                    <tr>
                                                        <td style="padding: 3px 0 0">
                                                            <img height="16"
                                                                 src="${config.server.backendServerUrl}mail-images/call.png"/>
                                                        </td>
                                                        <td style="padding:3px; font-size: 13px; color: #828F9D">
                                                            1234 420 581
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="vertical-align: top">
                                                            <img height="18"
                                                                 src="${config.server.backendServerUrl}mail-images/mail.png"/>
                                                        </td>
                                                        <td style="font-size: 13px; color: #828F9D">
                                                            info@tradecreditrisk.com.au <br/>sharon@tradecreditrisk.com.au
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="vertical-align: top">
                                                            <img height="18" style="padding-top: 0"
                                                                 src="${config.server.backendServerUrl}mail-images/location.png"/>
                                                        </td>
                                                        <td style="font-size: 13px; color: #828F9D">
                                                            Suite 11, 857 Doncaster Road
                                                            <br/> Doncaster East, Victoria 3109
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>

                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <tr>
                    <td align="center" style="padding: 30px 0 5px 0">
                        <img height="40" src="${config.server.backendServerUrl}mail-images/trad-icon.png"/>
                    </td>
                </tr>

                <tr>
                    <td align='center' valign='center'
                        style='padding: 5px 40px; font-size: 16px; font-family: GoogleSans-Medium; line-height: 24px; font-weight: 400;  color: #828F9D'>
                        Copyright © 2021 Trade Credit Risk
                    </td>
                </tr>

                <tr>
                    <td align="center" style="padding-bottom: 40px">
                        <table>
                            <tr>
                                <td>
                                    <a style="text-decoration: none">
                                        <img height="30" style="cursor:pointer;"
                                             src="${config.server.backendServerUrl}mail-images/facebook.png"/>
                                    </a>
                                </td>
                                <td>
                                    <a style="text-decoration: none">
                                        <img height="30" style="cursor:pointer;"
                                             src="${config.server.backendServerUrl}mail-images/linkedin.png"/>
                                    </a>
                                </td>
                                <td>
                                    <a style="text-decoration: none">
                                        <img height="30" style="cursor:pointer;"
                                             src="${config.server.backendServerUrl}mail-images/twitter.png"/>
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

            </table>
        </td>
    </tr>
</table>
</body>
</html>`;
};
