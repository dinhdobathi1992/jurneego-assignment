import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id as string;

  // Zod validation error
  if (error instanceof ZodError) {
    const response: ErrorResponse = {
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed',
      requestId,
      details: error.errors,
    };
    reply.status(422).send(response);
    return;
  }

  // Fastify validation error (Ajv/TypeBox)
  if (error.validation) {
    const response: ErrorResponse = {
      statusCode: 400,
      error: 'Bad Request',
      message: error.message || 'Request validation failed',
      requestId,
      details: error.validation,
    };
    reply.status(400).send(response);
    return;
  }

  // Known HTTP errors (via @fastify/sensible)
  if (error.statusCode) {
    const status = error.statusCode;
    const response: ErrorResponse = {
      statusCode: status,
      error: error.name || 'Error',
      message: error.message,
      requestId,
    };
    reply.status(status).send(response);
    return;
  }

  // Unexpected errors — do not leak internals
  request.log.error({ err: error, requestId }, 'Unhandled error');
  const response: ErrorResponse = {
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    requestId,
  };
  reply.status(500).send(response);
}
