"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.MasterChangeStatus = exports.DocumentType = exports.UserRole = exports.NotificationChannel = exports.ValidationOutcome = exports.LlmMode = exports.Priority = exports.ConfidenceBand = exports.IngestStatus = exports.CaseStatus = void 0;
var CaseStatus;
(function (CaseStatus) {
    CaseStatus["NEW"] = "NEW";
    CaseStatus["CLASSIFIED"] = "CLASSIFIED";
    CaseStatus["ROUTED"] = "ROUTED";
    CaseStatus["AWAITING_FPR"] = "AWAITING_FPR";
    CaseStatus["AWAITING_VENDOR"] = "AWAITING_VENDOR";
    CaseStatus["AWAITING_BUSINESS"] = "AWAITING_BUSINESS";
    CaseStatus["IN_REVIEW"] = "IN_REVIEW";
    CaseStatus["ESCALATED"] = "ESCALATED";
    CaseStatus["ON_HOLD"] = "ON_HOLD";
    CaseStatus["RESOLVED"] = "RESOLVED";
    CaseStatus["CLOSED"] = "CLOSED";
    CaseStatus["CANCELLED"] = "CANCELLED";
})(CaseStatus || (exports.CaseStatus = CaseStatus = {}));
var IngestStatus;
(function (IngestStatus) {
    IngestStatus["RECEIVED"] = "RECEIVED";
    IngestStatus["DUPLICATE"] = "DUPLICATE";
    IngestStatus["AUTO_REPLY"] = "AUTO_REPLY";
    IngestStatus["QUARANTINED"] = "QUARANTINED";
    IngestStatus["PROCESSING"] = "PROCESSING";
    IngestStatus["CLASSIFIED"] = "CLASSIFIED";
    IngestStatus["FAILED"] = "FAILED";
})(IngestStatus || (exports.IngestStatus = IngestStatus = {}));
var ConfidenceBand;
(function (ConfidenceBand) {
    ConfidenceBand["GREEN"] = "GREEN";
    ConfidenceBand["AMBER"] = "AMBER";
    ConfidenceBand["RED"] = "RED";
    ConfidenceBand["RED_MANUAL"] = "RED_MANUAL";
})(ConfidenceBand || (exports.ConfidenceBand = ConfidenceBand = {}));
var Priority;
(function (Priority) {
    Priority["LOW"] = "LOW";
    Priority["NORMAL"] = "NORMAL";
    Priority["HIGH"] = "HIGH";
    Priority["CRITICAL"] = "CRITICAL";
})(Priority || (exports.Priority = Priority = {}));
var LlmMode;
(function (LlmMode) {
    LlmMode["ON"] = "ON";
    LlmMode["DEGRADED"] = "DEGRADED";
    LlmMode["OFF"] = "OFF";
})(LlmMode || (exports.LlmMode = LlmMode = {}));
var ValidationOutcome;
(function (ValidationOutcome) {
    ValidationOutcome["PASS"] = "PASS";
    ValidationOutcome["FUZZY_MATCH"] = "FUZZY_MATCH";
    ValidationOutcome["FAIL"] = "FAIL";
})(ValidationOutcome || (exports.ValidationOutcome = ValidationOutcome = {}));
var NotificationChannel;
(function (NotificationChannel) {
    NotificationChannel["EMAIL"] = "EMAIL";
    NotificationChannel["SMS"] = "SMS";
    NotificationChannel["WHATSAPP"] = "WHATSAPP";
    NotificationChannel["TEAMS"] = "TEAMS";
    NotificationChannel["IN_APP"] = "IN_APP";
    NotificationChannel["PUSH"] = "PUSH";
})(NotificationChannel || (exports.NotificationChannel = NotificationChannel = {}));
var UserRole;
(function (UserRole) {
    UserRole["BUSINESS_TEAM_USER"] = "BUSINESS_TEAM_USER";
    UserRole["COLLATERAL_OFFICER"] = "COLLATERAL_OFFICER";
    UserRole["COLLATERAL_LEAD"] = "COLLATERAL_LEAD";
    UserRole["COLLATERAL_HEAD"] = "COLLATERAL_HEAD";
    UserRole["FPR"] = "FPR";
    UserRole["FPR_SUPERVISOR"] = "FPR_SUPERVISOR";
    UserRole["VENDOR"] = "VENDOR";
    UserRole["MASTER_DATA_ADMIN"] = "MASTER_DATA_ADMIN";
    UserRole["MASTER_DATA_APPROVER"] = "MASTER_DATA_APPROVER";
    UserRole["SYS_ADMIN"] = "SYS_ADMIN";
    UserRole["COMPLIANCE_OFFICER"] = "COMPLIANCE_OFFICER";
    UserRole["MLOPS"] = "MLOPS";
    UserRole["API_SERVICE_ACCOUNT"] = "API_SERVICE_ACCOUNT";
})(UserRole || (exports.UserRole = UserRole = {}));
var DocumentType;
(function (DocumentType) {
    DocumentType["VALUATION_REPORT"] = "VALUATION_REPORT";
    DocumentType["LEGAL_OPINION"] = "LEGAL_OPINION";
    DocumentType["RC_COPY"] = "RC_COPY";
    DocumentType["ENCUMBRANCE_CERT"] = "ENCUMBRANCE_CERT";
    DocumentType["PHOTO"] = "PHOTO";
    DocumentType["INVOICE"] = "INVOICE";
    DocumentType["ID_PROOF"] = "ID_PROOF";
    DocumentType["OTHER"] = "OTHER";
})(DocumentType || (exports.DocumentType = DocumentType = {}));
var MasterChangeStatus;
(function (MasterChangeStatus) {
    MasterChangeStatus["PENDING"] = "PENDING";
    MasterChangeStatus["APPROVED"] = "APPROVED";
    MasterChangeStatus["REJECTED"] = "REJECTED";
})(MasterChangeStatus || (exports.MasterChangeStatus = MasterChangeStatus = {}));
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["AUTH_REQUIRED"] = "AUTH_REQUIRED";
    ErrorCode["AUTH_FORBIDDEN"] = "AUTH_FORBIDDEN";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["RESOURCE_NOT_FOUND"] = "RESOURCE_NOT_FOUND";
    ErrorCode["CONFLICT"] = "CONFLICT";
    ErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    ErrorCode["UPSTREAM_TIMEOUT"] = "UPSTREAM_TIMEOUT";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
//# sourceMappingURL=index.js.map