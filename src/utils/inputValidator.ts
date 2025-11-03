import type { NextFunction, Request, Response } from "express";
import { auth, UserData } from "./auth";
import { fromNodeHeaders } from "better-auth/node";
import { deactivatedErrorMessager, errorMessager } from "./messager";

export function invalidString(input: unknown): boolean {
  if(typeof input != "string") return true;
  else if(!input) return true;
  else if(!input.trim()) return true;
  return false;
}

export function stringGiver(input: unknown): string|null {
  if(invalidString(input)) return null;
  return (input as string).trim().slice(0, 5000);
}

export function numberGiver(input: unknown): number|null {
  if(!["string", "number"].includes(typeof input)) return null;
  const num = Number(input);
  if(isNaN(num)) return null;
  
  return num;
}

type actors = "user" | "volunteer" | "organizer";

export type ModifiedRequest = Request & {user: UserData};
export function authenticationMiddleware(allowToGo: (actors)[] = ["organizer", "user", "volunteer"]):  (req: Request, res: Response, next: NextFunction)=>void {
  return async (req, res, next) => {
    const userData = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
    if(!userData?.user) return errorMessager(res, "Unauthorized", 403);
    else if(!new Set([...allowToGo, "admin"]).has(userData.user.actor as actors)) return errorMessager(res, "Unauthorized", 401);
    else if(!userData.user.activated) return deactivatedErrorMessager(res);

    (req as ModifiedRequest).user = userData.user as UserData;
    next();
  }
}