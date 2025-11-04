import { Router } from "express";
import { EventsManager } from "../tools/eventsManager";
import { ModifiedRequest, authenticationMiddleware, numberGiver, stringGiver } from "../utils/inputValidator";
import { deactivatedErrorMessager, errorMessager, internalServerErrorMessager, successMessager } from "../utils/messager";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { EventInfo, SectionInfo } from "../tools/queryManager";

const app = Router();
const eventsManager = new EventsManager();

// Add a new event:
app.post("/add", authenticationMiddleware(["organizer"]), async (req, res) => {
  interface RequestBody {
    eventInfo: Omit<EventInfo, "endsAt" | "createdAt" | "organizer"> & {endsAt: string};
    sections : Omit<SectionInfo, "event">[];
  };
  const data = req.body as RequestBody;

  try {
    const userData = (req as ModifiedRequest).user;
    // Validating event's data:
    const eventName = stringGiver(data.eventInfo.name);
    if(!eventName) return errorMessager(res, "No event name specified");

    const eventDescription = stringGiver(data.eventInfo.description);
    if(!eventDescription) return errorMessager(res, "No event description specified");

    const eventAcceptsVolunteers = Boolean(data.eventInfo.acceptvolunteers);
    const eventEndsAt = data.eventInfo.endsAt.trim();
    if(isNaN(new Date(eventEndsAt).getTime())) return errorMessager(res, "Event's end date is not valid");

    const eventEndsAtDate = new Date(eventEndsAt);
    if(eventEndsAtDate < new Date()) return errorMessager(res, "Event's end date is not valid");

    // Adding the new data:
    const eventData = await eventsManager.createEvent({
      name: eventName,
      acceptvolunteers: eventAcceptsVolunteers,
      createdat: new Date(),
      description: eventDescription,
      endsat: eventEndsAtDate,
      organizer: userData.id,
    });

    // Validating each section's data:
    // PostgreSQL returns the inserted row, not insertId
    const eventId = eventData.rows[0]?.id;
    if (!eventId) return errorMessager(res, "Failed to create event");

    for(const section of data.sections) {
      const sectionName = stringGiver(section.name);
      if(!sectionName) return errorMessager(res, "There's a section with an invalid or empty name, please double-check");

      const sectionDescription = stringGiver(section.description);
      if(!sectionDescription) return errorMessager(res, "There's a section with an invalid or empty description, please double-check");

      const maxSubscribers = numberGiver(section.maxSubscribers);
      if(maxSubscribers && maxSubscribers < 0) return errorMessager(res, "There's a section with an invalid or empty max number of subscribers, please double-check");

      // Inserting a new section:
      await eventsManager.createSection({
        description: sectionDescription,
        event: eventId,
        maxSubscribers: maxSubscribers ? Math.round(maxSubscribers) : 100,
        name: sectionName,
        subscriptions: 0,
      });
    }
    return successMessager(res);
  }
  catch(error) {
    const generalError = error as any;
    if(generalError.body) return errorMessager(res, generalError.body.message, generalError.statusCode);
    else {
      console.error("Error adding a new event:", error);
      return errorMessager(res, "Internal server error", 500);
    }
  }
});

// Editing an event
app.post("/edit/:id", authenticationMiddleware(["organizer"]), async (req, res) => {
  interface RequestBody {
    eventInfo: Omit<EventInfo, "endsAt" | "createdat"> & {endsAt: string};
    sections : (Omit<SectionInfo, "event"> & {id?: string | number})[];
  };

  try {
    const data = req.body as RequestBody;
    const eventId = numberGiver(req.params.id);
    if(!eventId) return errorMessager(res, "The event ID given is invalid");

    const fetchedEvent = await eventsManager.getEvent(eventId);
    if(!fetchedEvent.length) return errorMessager(res, "The event doesn't exist.");
    if(fetchedEvent[0].organizer != (req as ModifiedRequest).user.id) return errorMessager(res, "Unauthorized", 401);

    // Validating event's data:
    const eventName = stringGiver(data.eventInfo.name);
    if(!eventName) return errorMessager(res, "No event name specified");

    const eventDescription = stringGiver(data.eventInfo.description);
    if(!eventDescription) return errorMessager(res, "No event description specified");

    const eventAcceptsVolunteers = Boolean(data.eventInfo.acceptvolunteers);
    const eventEndsAt = data.eventInfo.endsAt.trim();
    if(isNaN(new Date(eventEndsAt).getTime())) return errorMessager(res, "Event's end date is not valid");

    const eventEndsAtDate = new Date(eventEndsAt);
    if(eventEndsAtDate < new Date()) return errorMessager(res, "Event's end date is not valid (before the present, in the past)");

    // Updating the event's data:
    await eventsManager.updateEvent(eventId, {
      acceptvolunteers: eventAcceptsVolunteers,
      description: eventDescription,
      endsat: eventEndsAtDate,
      name: eventName,
      createdat: new Date()
    });

    // Validating each section's data:
    const existingSectionsIds: number[] = [];
    for(const section of data.sections) {
      const sectionName = stringGiver(section.name);
      if(!sectionName) return errorMessager(res, "There's a section with an invalid or empty name, please double-check");

      const sectionDescription = stringGiver(section.description);
      if(!sectionDescription) return errorMessager(res, "There's a section with an invalid or empty description, please double-check");

      const maxSubscribers = numberGiver(section.maxSubscribers);
      if(maxSubscribers && maxSubscribers < 0) return errorMessager(res, "There's a section with an invalid or empty max number of subscribers, please double-check");

      const sectionId = numberGiver(section.id);
      if(section.id && !sectionId) return errorMessager(res, "Invalid section ID");
      
      // Check if section exists
      let fetchedSection: SectionInfo[] = [];
      if (sectionId) {
        fetchedSection = await eventsManager.getSection(sectionId);
      }

      // Adding a new section:
      if(!fetchedSection.length) {
        const newCreatedSection = await eventsManager.createSection({
          description: sectionDescription,
          event: eventId,
          maxSubscribers: maxSubscribers ? Math.round(maxSubscribers) : 100,
          name: sectionName,
          subscriptions: 0,
        });
        // PostgreSQL returns the inserted row
        const newSectionId = newCreatedSection.rows[0]?.id;
        if (newSectionId) {
          existingSectionsIds.push(newSectionId);
        }
      }
      // Updating an existing section:
      else {
        await eventsManager.updateSection(sectionId!, {
          description: sectionDescription,
          maxSubscribers: maxSubscribers ? Math.round(maxSubscribers) : 100,
          name: sectionName,
        });
        existingSectionsIds.push(sectionId!);
      }
    }
    await eventsManager.deleteOtherSections(eventId, existingSectionsIds);
    return successMessager(res);
  }
  catch(error) {
    const generalError = error as any;
    if(generalError.body) return errorMessager(res, generalError.body.message, generalError.statusCode);
    else {
      console.error("Error editing an existing event:", error);
      return errorMessager(res, "Internal server error", 500);
    }
  }
});

// Getting events by an organiser's ID
app.get("/get/organiser/:id", async (req, res) => {
  const organiser = req.params.id;
  try {
    const eventData = await eventsManager.getEventsAndSectionsByOrganiser(organiser);
    return successMessager(res, eventData);
  }
  catch(error) {
    console.error(`Error fetching an event with organiser ID#${organiser}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Deleting an event by the event's ID
app.get("/delete/:id", authenticationMiddleware(["organizer"]), async (req, res) => {
  try {
    const eventId = numberGiver(req.params.id);
    if(!eventId) return errorMessager(res, "Invalid event ID");

    const [event] = await eventsManager.getEvent(eventId);
    if((req as ModifiedRequest).user.id != event.organizer) return errorMessager(res, "Unauthorized", 401);

    await eventsManager.deleteEvent(eventId);
    return successMessager(res);
  }
  catch(error) {
    console.error(`Error deleting event with ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Get all events that needs volunteers
app.get("/get/needVolunteers", async (_req, res) => {
  try {
    const events = await eventsManager.getEventsAndSectionsThatNeedVolunteer();
    return successMessager(res, events);
  }
  catch(error) {
    console.error(`Error getting events that need volunteers:`, error);
    return internalServerErrorMessager(res);
  }
})

// Requesting a volunteering from a volunteer account to an organiser
app.post("/requestVolunteering", authenticationMiddleware(["volunteer"]), async (req, res) => {
  type receivedDataType = {
    description: string;
    event: string | number;
  }

  try {
    const receivedData = req.body as receivedDataType;

    const description = stringGiver(receivedData.description);
    if(!description) return errorMessager(res, "Invalid or missing description");

    const eventId = numberGiver(receivedData.event);
    if(!eventId) return errorMessager(res, "Invalid or missing event ID");

    const userId = (req as ModifiedRequest).user.id;

    const fetchedEvent = await eventsManager.getEvent(eventId);
    if(!fetchedEvent.length) return errorMessager(res, "The event provided does not exist");
    if(!fetchedEvent[0].acceptvolunteers) return errorMessager(res, "The event doesn't accept volunteers");

    const requestedBefore = await eventsManager.checkIsRequested(userId);
    if(requestedBefore) return errorMessager(res, "You cannot request again", 401);

    const currentDate = new Date();
    await eventsManager.submitVolunteeringRequest({
      date: currentDate,
      description: description,
      event: eventId,
      verified: false,
      volunteer: userId,
    });

    return successMessager(res);
  }
  catch(error) {
    console.error(`Error requesting volunteering to an event:`, error);
    return internalServerErrorMessager(res);
  }
});

// Checking if there's any volunteering requests from the user:
app.get("/checkVolunteer", authenticationMiddleware(), async (req, res) => {
  try {    
    const hasRequestedToVolunteer = await eventsManager.checkIsRequested((req as ModifiedRequest).user.id);
    if(hasRequestedToVolunteer) return errorMessager(res, "User requested before");
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error checking if user has requested to volunteer:`, error);
    return internalServerErrorMessager(res);
  }
});

// Get all volunteering requests to organiser
app.get("/volunteers/byOrganiser/:id", authenticationMiddleware(), async (req, res) => {
  try {
    const id = stringGiver(req.params.id);
    if(!id) return errorMessager(res, "ID of the organiser is required");

    if((req as ModifiedRequest).user.id != id) return errorMessager(res, "Unauthorized", 401);

    const requests = await eventsManager.getVolunteeringRequestsForOrganiser(id);
    return successMessager(res, requests);
  }
  catch(error) {
    console.error(`Error fetching volunteer requests from the organiser of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Get all volunteering requests that were sent by volunteer
app.get("/volunteers/byVolunteer/:id", authenticationMiddleware(), async (req, res) => {
  try {
    const id = stringGiver(req.params.id);
    if(!id) return errorMessager(res, "ID of the volunteer is required");

    else if((req as ModifiedRequest).user.id != id) return errorMessager(res, "Unauthorized", 401);

    const requests = await eventsManager.getVolunteeringRequestsForVolunteer(id);
    return successMessager(res, requests);
  }
  catch(error) {
    console.error(`Error fetching volunteer requests from the volunteer of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Deleting a volunteering request:
app.delete("/volunteers/requests/delete/:id", authenticationMiddleware(["organizer", "volunteer"]), async (req, res) => {
  try {
    const id = numberGiver(req.params.id);
    if(!id) return errorMessager(res, "ID of the request is required");
    
    const response = await eventsManager.deleteVolunteeringRequest(id, (req as ModifiedRequest).user.id);
    // Changed from affectedRows to rowCount
    if(response.rowCount === 0) return errorMessager(res, "Request unavailable, or unauthorized");
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error deleting volunteer requests of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Confirming a volunteering request:
app.get("/volunteers/requests/confirm/:id", authenticationMiddleware(["organizer"]), async (req, res) => {
  try {
    const id = numberGiver(req.params.id);
    if(!id) return errorMessager(res, "ID of the request is required");

    const response = await eventsManager.confirmVolunteeringRequest(id, (req as ModifiedRequest).user.id);
    // Changed from affectedRows to rowCount
    if(response.rowCount === 0) return errorMessager(res, "Request unavailable, or unauthorized");
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error confirming volunteer requests of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Unconfirming a volunteering request:
app.get("/volunteers/requests/unconfirm/:id", authenticationMiddleware(["organizer"]), async (req, res) => {
  try {
    const id = numberGiver(req.params.id);
    if(!id) return errorMessager(res, "ID of the request is required");

    const response = await eventsManager.confirmVolunteeringRequest(id, (req as ModifiedRequest).user.id, true);
    // Changed from affectedRows to rowCount
    if(response.rowCount === 0) return errorMessager(res, "Request unavailable, or unauthorized");
    else return successMessager(res);
  }
  catch(error) {
    console.error(`Error confirming volunteer requests of ID#${req.params.id}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Getting all events for users to subscribe:
app.get("/getAll", authenticationMiddleware(), async (req, res) => {
  try {
    const events = await eventsManager.getEventsAndSectionsForUsers();
    return successMessager(res, events);
  }
  catch(error) {
    console.error(`Error getting all the events for the user:`, error);
    return internalServerErrorMessager(res);
  }
});

// Getting all the sections of an event:
app.get("/sectionsOf/:event", authenticationMiddleware(), async (req, res) => {
  try{
    const eventId = numberGiver(req.params.event);
    if(!eventId) return errorMessager(res, "Event ID is required");

    const result = await eventsManager.getSectionsByEvent(eventId, {checkSubscription: (req as ModifiedRequest).user.actor == "user", userId: (req as ModifiedRequest).user.id});
    return successMessager(res, result);
  }
  catch(error) {
    console.error(`Error fetching the sections of event ${req.params.event}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Subscribing to an event's section:
app.get("/subscribe/:section", authenticationMiddleware(["user"]), async (req, res) => {
  try {
    const sectionId = numberGiver(req.params.section);
    if(!sectionId) return errorMessager(res, "Section ID is required");
    
    const userId = (req as ModifiedRequest).user.id;

    const isSubscribed = await eventsManager.checkIfUserSubscribedToSection(sectionId, userId);
    if(isSubscribed) return errorMessager(res, "You are already subscribed");

    const fetchedSection = await eventsManager.getSection(sectionId);
    if(fetchedSection.length == 0) return errorMessager(res, "Section not found!", 404);

    const addedSubscription = await eventsManager.addSubscription(sectionId, userId);
    if(addedSubscription) return successMessager(res);
    else return errorMessager(res, "Section's full already");
  }
  catch(error) {
    console.error(`Error subscribing to section ${req.params.section}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Unsubscribing to an event's section:
app.get("/unsubscribe/:section", authenticationMiddleware(["user"]), async (req, res) => {
  try {
    const sectionId = numberGiver(req.params.section);
    if(!sectionId) return errorMessager(res, "Section ID is required");
    
    const userId = (req as ModifiedRequest).user.id;

    const isSubscribed = await eventsManager.checkIfUserSubscribedToSection(sectionId, userId);
    if(!isSubscribed) return errorMessager(res, "You are not subscribed");

    const fetchedSection = await eventsManager.getSection(sectionId);
    if(fetchedSection.length == 0) return errorMessager(res, "Section not found!", 404);

    await eventsManager.deleteSubscription(sectionId, userId);
    return successMessager(res);
  }
  catch(error) {
    console.error(`Error unsubscribing to section ${req.params.section}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Getting subscriptions of the user
app.get("/subscriptions", authenticationMiddleware(["user"]), async (req, res) => {
  try {
    const data = await eventsManager.getUserSubscriptions((req as ModifiedRequest).user.id);
    return successMessager(res, data);
  }
  catch(error) {
    console.error(`Error getting the subscriptions of the user:`, error);
    return internalServerErrorMessager(res);
  }
});

// Getting subscribers of an event
app.get("/subscribers/:eventId", authenticationMiddleware(["organizer"]), async (req, res) => {
  try {
    const id = numberGiver(req.params.eventId);
    if(!id) return errorMessager(res, "Event ID is required");
    const users = await eventsManager.getEventSubscribers(id, (req as ModifiedRequest).user.id);
    return successMessager(res, users);
  }
  catch(error) {
    console.error(`Error getting the subscribers of event #${req.params.eventId}:`, error);
    return internalServerErrorMessager(res);
  }
});

// Kick a subscriber from the whole event:
app.delete("/subscribers/:eventId/kick/:userId", authenticationMiddleware(["organizer"]), async (req, res) => {
  try {
    const eventId = numberGiver(req.params.eventId);
    if(!eventId) return errorMessager(res, "Event ID is required");
    const userId = stringGiver(req.params.userId);
    if(!userId) return errorMessager(res, "User ID is required");
    const isKicked = await eventsManager.kickSubscriber(eventId, (req as ModifiedRequest).user.id, userId);
    // Changed from affectedRows to rowCount
    if(isKicked.rowCount == 0) return errorMessager(res, "User doesn't exist, or already kicked");
    return successMessager(res);
  }
  catch(error) {
    console.error(`Error kicking the subscriber #${req.params.userId} of event #${req.params.eventId}:`, error);
    return internalServerErrorMessager(res);
  }
});

app.get("/volunteersOf/:eventId", authenticationMiddleware(["organizer"]), async (req, res) => {
  try {
    const eventId = numberGiver(req.params.eventId);
    if(!eventId) return errorMessager(res, "Event ID is required");
    const volunteers = await eventsManager.getVolunteersOfEvent(eventId, (req as ModifiedRequest).user.id);
    return successMessager(res, volunteers);
  }
  catch(error) {
    console.error(`Error getting the accepted volunteers for event#${req.params.eventId}`)
    return internalServerErrorMessager(res);
  }
})

export default app;