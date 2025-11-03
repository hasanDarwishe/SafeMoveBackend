import { Router, type Request, type Response } from "express";
import { auth } from "../utils/auth";
import { errorMessager, internalServerErrorMessager, successMessager } from "../utils/messager";
import { ResponseType } from "../server";
import { fromNodeHeaders } from "better-auth/node";

const app = Router();

function RouteGenerator(role: string): (req: Request, res: Response) => Promise<Response> {
  return async (req: Request, res: Response): Promise<Response> => {
    try {
      const updateUserResponse = await auth.api.updateUser({body: {actor: role}, asResponse: true, headers: fromNodeHeaders(req.headers)});
      const setCookieHeader = updateUserResponse.headers.getSetCookie();
      res.setHeader("Set-Cookie", setCookieHeader);

      return successMessager(res);
    }
    catch (error: unknown) {
      const context = error as any;
      if(context?.body) return errorMessager(res, context.body.message as string, context.statusCode as number);
      else return internalServerErrorMessager(res);
    }
  }
}

app.get("/user", RouteGenerator("user"));
app.get("/volunteer", RouteGenerator("volunteer"));
app.get("/organizer", RouteGenerator("organizer"));

export default app;