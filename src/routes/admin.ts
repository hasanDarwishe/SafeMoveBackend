import { Router, type Request } from "express";
import { errorMessager, internalServerErrorMessager, successMessager } from "../utils/messager";
import { auth, UserData } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { customResultedQuery, normalResultedQuery } from "../tools/queryManager";
// Remove MySQL import
// import { ResultSetHeader } from "mysql2";
import { stringGiver } from "../utils/inputValidator";

const app = Router();
type AdminsRequest = Request & {user: UserData};

app.use(async (req, res, next) => {
  try {
    const userData = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
    if(!userData?.user) return errorMessager(res, "Unauthorized", 403);
    else if(userData.user.actor != "admin") return errorMessager(res, "Unauthorized", 401);
    else {
      (req as AdminsRequest).user = userData.user as UserData;
      next();
    }
  }
  catch(error) {
    console.error(`Error validating user's role if it's admin or not:`, error);
    return internalServerErrorMessager(res);
  }
});

async function changeActivationOfUser(userId: string, activate: boolean): Promise<boolean> {
  return await customResultedQuery<boolean>(
    `UPDATE "user" SET activated=$1 WHERE id=$2 AND actor != 'admin'`,
    [activate, userId],
    (result) => (result as any).rowCount > 0 // Changed from affectedRows to rowCount
  );
}

// Activating a user's account again:
app.get("/activate/:id", async (req, res) => {
  try {
    const userId = stringGiver(req.params.id);
    if(!userId) return errorMessager(res, "User ID is required");
    const isActivated = await changeActivationOfUser(userId, true);
    if(!isActivated) return errorMessager(res, "User doesn't exist or account type is admin")
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error activating account of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Deactivating a user's account:
app.get("/deactivate/:id", async (req, res) => {
  try {
    const userId = stringGiver(req.params.id);
    if(!userId) return errorMessager(res, "User ID is required");
    const isDectivated = await changeActivationOfUser(userId, false);
    if(!isDectivated) return errorMessager(res, "User doesn't exist or account type is admin")
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error deactivating account of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Getting all users:
app.get("/users", async (req, res) => {
  try {
    type CustomType = (Omit<UserData, "actor"> & {actor: "user" | "volunteer" | "organizer"})[]
    const users = await normalResultedQuery<CustomType>(
      `SELECT * FROM "user" WHERE "user".actor != 'admin'`,
      []
    );
    return successMessager(res, users);
  }
  catch(error) {
    console.error(`Error getting all users:`, error);
    return internalServerErrorMessager(res);
  }
});

// Deleting a non-admin user:
app.delete("/deleteUser/:id", async (req, res) => {
  try {
    const userId = stringGiver(req.params.id);
    if(!userId) return errorMessager(res, "User ID is required");

    // PostgreSQL doesn't support multi-table DELETE with JOIN in the same way as MySQL
    // We need to handle this with CASCADE deletes or separate queries
    const response = await normalResultedQuery<any>(
      `DELETE FROM "user" WHERE id=$1 AND actor != 'admin'`,
      [userId]
    );
    
    // Changed from affectedRows to rowCount
    if(response.rowCount == 0) return errorMessager(res, "User is admin or doesn't exist");
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error deleting user#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Alternative approach for cascading delete if you need to ensure related records are deleted:
async function deleteUserWithCascade(userId: string): Promise<boolean> {
  try {
    // Use transactions or rely on foreign key CASCADE delete
    // Option 1: Use separate queries in transaction
    await customResultedQuery(
      `DELETE FROM volunteer_requests WHERE volunteer=$1`,
      [userId],
      () => true
    );
    
    await customResultedQuery(
      `DELETE FROM subscriptions WHERE participator=$1`,
      [userId],
      () => true
    );
    
    // Delete events created by this user if they're an organizer
    await customResultedQuery(
      `DELETE FROM events WHERE organizer=$1`,
      [userId],
      () => true
    );
    
    await customResultedQuery(
      `DELETE FROM account WHERE "userId"=$1`,
      [userId],
      () => true
    );
    
    const result = await customResultedQuery(
      `DELETE FROM "user" WHERE id=$1 AND actor != 'admin'`,
      [userId],
      (result) => (result as any).rowCount > 0
    );
    
    return result;
  } catch (error) {
    console.error('Error in cascade delete:', error);
    return false;
  }
}

// Checks if the user has the admin privilege
app.get("/check", (req, res) => {
  // Already checked in the middleware
  return successMessager(res);
})

export default app;