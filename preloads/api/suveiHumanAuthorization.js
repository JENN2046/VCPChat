"use strict";

const { invoke } = require("../core/define");

module.exports = {
    handlers: ["modules/ipc/suveiHumanAuthorizationHandlers.js"],
    roles: ["chat"],
    api: {
        getSuveiHumanAuthorizationStatus: invoke("suvei-human-authorization:status"),
        loginSuveiHumanOwner: invoke("suvei-human-authorization:login", "payload"),
        logoutSuveiHumanOwner: invoke("suvei-human-authorization:logout"),
        prepareSuveiHumanAuthorization: invoke("suvei-human-authorization:prepare", "approvalData"),
        decideSuveiHumanAuthorization: invoke("suvei-human-authorization:decide", "payload"),
    },
};
