import { Request, Response, NextFunction } from 'express';

export default function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.message.includes('Invalid') || err.message.includes('Unsupported') ? 400 : 500;
  res.status(statusCode).json({
    error: err.message || 'An unexpected error occurred. Please try again later.',
  });
}