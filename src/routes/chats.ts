import { Router } from "express";
import { authenticationMiddleware, ModifiedRequest, stringGiver } from "../utils/inputValidator";
import { errorMessager, internalServerErrorMessager, successMessager } from "../utils/messager";
import { MessagesDatabaseManager } from "../tools/messagesDatabaseManager";

const app = Router();
const dbManager = new MessagesDatabaseManager();

app.use(authenticationMiddleware(["organizer", "volunteer"]))

app.get("/getContacts", async (req, res) => {
  try {
    const user = (req as ModifiedRequest).user;
    if(user.actor == "organizer") {
      const data = await dbManager.getContactsForOrganiser(user.id);
      return successMessager(res, data)
    } else {
      const data = await dbManager.getContactsForVolunteer(user.id);
      return successMessager(res, data)
    }
  }
  catch(error) {
    console.error(`Error getting the contacts of a user:`, error);
    return internalServerErrorMessager(res);
  }
});

app.get("/getMessages/:contactId", async (req, res) => {
  try {
    const user = (req as unknown as ModifiedRequest).user; // Fixed type casting
    const contactId = stringGiver(req.params.contactId);
    if(!contactId) return errorMessager(res, "Contact ID is required");
    const volunteerId = user.actor == "volunteer" ? user.id : contactId;
    const organiserId = user.actor == "organizer" ? user.id : contactId;
    const messages = await dbManager.getMessages(volunteerId, organiserId);
    return successMessager(res, messages);
  }
  catch(error) {
    console.error(`Error getting messages from contact #${req.params.contactId}:`, error);
    return internalServerErrorMessager(res);
  }
})

export default app;