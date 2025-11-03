// Specialized at producing responses to the client
import { Response } from "express";
import { ResponseType } from "../server";

export function errorMessager(res: Response, message: string, status: number = 400): Response {
  const response: ResponseType = {
    error: true,
    data: {
      status: status,
      message: message
    }
  };
  return res.status(status).json(response);
}

export function internalServerErrorMessager(res: Response): Response {
  return errorMessager(res, "Internal server error", 500);
}

export function successMessager(res: Response, data?: any) {
  return res.status(200).json({error: false, data});
}

export function deactivatedErrorMessager(res: Response): Response {
  return errorMessager(res, "Your account got deactivated by admins", 401);
}