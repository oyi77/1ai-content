/**
 * Logger Utility
 *
 * Centralized logging configuration using Winston
 */

import winston from "winston";
import { getCorrelationId } from "./correlation";

// Uses process.env directly — logger is loaded before config init
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";

const { combine, timestamp, json, printf, colorize } = winston.format;

// Enriches every log entry with the current async-context correlationId
const correlationFormat = winston.format((info) => {
  info.correlationId = getCorrelationId();
  return info;
});

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: {
    service: "openclaw-bot",
    environment: NODE_ENV,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        correlationFormat(),
        colorize(),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        NODE_ENV === "production" ? json() : devFormat,
      ),
    }),

    // File transport for errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: combine(correlationFormat(), timestamp(), json()),
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: "logs/combined.log",
      format: combine(correlationFormat(), timestamp(), json()),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: "logs/exceptions.log" }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: "logs/rejections.log" }),
  ],
});

// Add request context
export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId });
};

export { logger };
