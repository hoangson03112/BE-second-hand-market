"use strict";

const AdminAuditLog = require("../models/AdminAuditLog");

async function logAdminAction({
  adminId,
  action,
  targetType,
  targetId,
  metadata = {},
  req = null,
}) {
  if (!adminId || !action || !targetType || !targetId) return null;

  const ip =
    req?.headers?.["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() ||
    req?.ip ||
    null;
  const userAgent = req?.headers?.["user-agent"] || null;

  return AdminAuditLog.create({
    adminId,
    action,
    targetType,
    targetId: String(targetId),
    metadata,
    ip,
    userAgent,
  });
}

module.exports = {
  logAdminAction,
};

