import { Router } from "express";
import { stringGiver } from "../utils/inputValidator";
import { errorMessager, internalServerErrorMessager, successMessager } from "../utils/messager";
import validator from "validator";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";

const router = Router();

// The route that creates a new user:

interface SignUpInterface {
  name: String;
  email: String;
  password: String;
  accountType: String;
  verifyPassword: String;
};

router.post("/signup", async (req, res) => {
  const recievedData = req.body as SignUpInterface;

  try {
    // Validating user data:
    const name = stringGiver(recievedData.name);
    if(!name) return errorMessager(res, "The name is required, please fill it in.");

    const email = stringGiver(recievedData.email);
    if(!email) return errorMessager(res, "The e-mail is required, please fill it in.");

    const password = stringGiver(recievedData.password);
    if(!password) return errorMessager(res, "The password is required, please fill it in.");

    const verifyPassword = stringGiver(recievedData.verifyPassword);
    if(!verifyPassword) return errorMessager(res, "The password verification is required, please fill it in.");

    const accountType = stringGiver(recievedData.accountType);
    if(!accountType) return errorMessager(res, "No account type given.");

    if(accountType == "admin") return errorMessager(res, "Request failed.", 401);
    if(!["user", "volunteer", "organizer"].includes(accountType)) return errorMessager(res, "The account type isn't correct.");
    if(verifyPassword !== password) return errorMessager(res, "The password and password verification aren't matching");
    if(!validator.isEmail(email)) return errorMessager(res, "Email validation failed, please try later.", 403);
    if(password.length < 6) return errorMessager(res, "Your password's length is less than 6 characters, please make it longer.");

    // Authenticating user and signing them up:
    const response = await auth.api.signUpEmail({body: { email, password, name, actor: accountType }, headers: fromNodeHeaders(req.headers), asResponse: true});
    const setCookieHeader = response.headers.getSetCookie();
    res.setHeader('Set-Cookie', setCookieHeader);

    const data = await response.json() as any;
    const {user} = data;
    if(user) {
      return successMessager(res);
    }
  }
  catch(error) {
    const context = error as any;
    if(context.body) return errorMessager(res, context.body.message, context.statusCode);
    else {
      console.error("Error signing up:", error);
      return errorMessager(res, "Internal server error", 500);
    }
  }
});

// The route that signs in to an existing user:

interface SignInInterface {
  email: String;
  password: String;
};

router.post("/signin", async (req, res) => {
  const recievedData = req.body as SignInInterface;

  try {
    // Validating user data:
    const email = stringGiver(recievedData.email);
    if(!email) return errorMessager(res, "The e-mail is required, please fill it in.");

    const password = stringGiver(recievedData.password);
    if(!password) return errorMessager(res, "The password is required, please fill it in.");

    if(!validator.isEmail(email)) return errorMessager(res, "Email validation failed, please try later.");

    // Authenticating user and signing them in:
    const response = await auth.api.signInEmail({body: { email, password }, headers: fromNodeHeaders(req.headers), asResponse: true});
    const setCookieHeader = response.headers.getSetCookie();
    res.setHeader('Set-Cookie', setCookieHeader);

    const data = await response.json() as any;
    const user = data?.user;
    if(user) {
      return successMessager(res);
    }
  }
  catch(error) {
    const context = error as any;
    if(context.body) return errorMessager(res, context.body.message, context.statusCode);
    else {
      console.error("Error signing in:", error);
      return errorMessager(res, "Internal server error", 500);
    }
  }
});

// The route that gets the current user's data:

router.get("/getUserInfo", async (req, res) => {
  try {
    const session = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
    if (!session) {
      return errorMessager(res, "No session found", 401);
    }
    if (!session?.user) {
      return errorMessager(res, "User not found", 404);
    }

    const user = session.user;
    
    return successMessager(res, user);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return internalServerErrorMessager(res);
  }
});

// The route that logs the user out:

router.get("/logout", async (req, res) => {
  try {
    const response = await auth.api.signOut({headers: fromNodeHeaders(req.headers), query: {disableCookieCache: true}, asResponse: true});
    const setCookieHeader = response.headers.getSetCookie();
    res.setHeader('Set-Cookie', setCookieHeader);

    const data = await response.json() as any;
    if(data.success) {
      return successMessager(res);
    }
  }
  catch(error) {
    const context = error as any;
    if(context.body) return errorMessager(res, context.body.message, context.statusCode);
    else {
      console.error("Error signing up:", error);
      return errorMessager(res, "Internal server error", 500);
    }
  }
})

export default router;