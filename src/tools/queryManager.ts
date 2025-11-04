import db from "../utils/database";

const timeoutDefault = 10 as const;

export async function customResultedQuery<T>(query: string, params: unknown[], resultFunction: (result: unknown) => T, timeout: number = timeoutDefault): Promise<T> {
  // PostgreSQL uses different timeout syntax
  const executionQuery = query;

  try {
    const result = await db.query(executionQuery, params);
    // PostgreSQL returns a Result object, not an array
    const actualResult = result.rows || result;
    return resultFunction(actualResult);
  } catch (err) {
    throw err;
  }
}

export async function normalResultedQuery<T>(query: string, params: unknown[], timeout: number = timeoutDefault): Promise<T> {
  return await customResultedQuery(query, params, (result) => result as T, timeout);
}

export type EventInfo = {
  name: string;
  description: string;
  createdat: Date;
  organizer: string;
  endsat: Date;
  acceptvolunteers: boolean;
  organiserName: string;
}

export type EventResult = EventInfo & {id: number}; // Removed RowDataPacket

export type SectionInfo = {
  event: number;
  name: string;
  description: string;
  maxSubscribers: number;
  subscriptions: number;
}

export type SectionResult = SectionInfo & {id: number}; // Removed RowDataPacket

export type VolunteeringRequestInfo = {
  event: number;
  volunteer: string;
  date: Date;
  verified: boolean;
  description: string;
}

export type VolunteeringRequestResult = VolunteeringRequestInfo & {id: number;}; // Removed RowDataPacket
export type VolunteeringRequestResultWithEventQuery = VolunteeringRequestResult & {
  eventId: number;
  eventName: string;
  eventDescription: string;
  eventCreatedAt: Date;
  eventEndsAt: Date;
  eventOrganiser: string;
  eventAcceptVolunteers: boolean;
  organiserName: string;
  volunteerName: string;
};
export type VolunteeringRequestResultApi = Omit<VolunteeringRequestResult, "event"> & {event: EventResult; volunteerName: string;};

export type SubscriptionsInfo = {
  section: number;
  participator: string;
  date: Date;
}
export type SubscriptionsResult = SubscriptionsInfo & {id: number;}; // Removed RowDataPacket

export type UserSubscriptions = {
  event: EventResult;
  sectionInfo: SectionResult;
  isSubscribed: boolean;
} & SubscriptionsResult;

export type EventsWithTheirSectionsResult = EventInfo & {
  sections: (SectionInfo & {id: number;})[],
  id: number
}
export type GetEventsAndSectionsQueryType = SectionsColumnsType & EventsColumnsType; // Removed RowDataPacket

// Ready-to-use query constants:

export const eventsColumns = `
  events.id AS "eventId",
  events.name AS "eventName",
  events.description AS "eventDescription",
  events."createdAt" AS "eventCreatedAt",
  events."endsat" AS "eventEndsAt",
  events.organizer AS "eventOrganiser",
  events."acceptvolunteers" AS "eventAcceptVolunteers",
  (SELECT name FROM "user" WHERE "user".id = events.organizer) AS "organiserName"
`;

export interface EventsColumnsType {
  eventId: number;
  eventName: string;
  eventDescription: string;
  eventCreatedAt: Date;
  eventEndsAt: Date;
  eventOrganiser: string;
  eventAcceptVolunteers: boolean;
  organiserName: string;
}

export const sectionsColumns = `
  sections.id AS "sectionId",
  sections.event AS "sectionEvent",
  sections.name AS "sectionName",
  sections.description AS "sectionDescription",
  sections."maxsubscribers" AS "sectionMaxSubscribers",
  (SELECT COUNT(subscriptions.id) FROM subscriptions WHERE subscriptions.section = sections.id) AS "sectionSubscriptions"
`;

export interface SectionsColumnsType {
  sectionId: number;
  sectionEvent: number;
  sectionName: string;
  sectionDescription: string;
  sectionMaxSubscribers: number;
  sectionSubscriptions: number;
}

export const queries = {
  events: {
    baseColumns: `
      events.*,
      "user".name AS "organiserName"
    `,
    baseFrom: `
      FROM events
      INNER JOIN "user" ON "user".id = events.organizer
    `,
    insertColumns: `name, description, "createdat", organizer, "endsAt", "acceptvolunteers"`, // Quoted reserved words
  },
  sections: {
    baseColumns: `
      sections.*,
      (SELECT COUNT(subscriptions.id) FROM subscriptions WHERE subscriptions.section = sections.id) AS subscriptions
    `,
    baseFrom: `
      FROM sections
    `,
    baseFromWithEvents: `
      FROM sections
      INNER JOIN events ON sections.event = events.id
    `,
    insertColumns: `name, description, event, "maxsubscribers"`, // Quoted reserved words
  },
  volunteer_requests: {
    insertColumns: `event, volunteer, date, verified, description`,
    baseColumns: `
      volunteer_requests.*,
      ${eventsColumns},
      organiser_user.name AS "organiserName",
      volunteer_user.name AS "volunteerName"
    `,
    baseFrom: `
      FROM volunteer_requests
      INNER JOIN events ON volunteer_requests.event = events.id
      INNER JOIN "user" AS organiser_user ON events.organizer = organiser_user.id
      INNER JOIN "user" AS volunteer_user ON volunteer_requests.volunteer = volunteer_user.id
    `,
  },
  subscriptions: {
    insertColumns: `section, participator, date`,
    selectWithSectionAndEventsColumns: `
      subscriptions.*,
      ${eventsColumns},
      ${sectionsColumns},
      (SELECT COUNT(*) FROM subscriptions WHERE participator = subscriptions.participator AND section=sections.id) AS "isSubscribed"
    `,
    selectWithSectionAndEventsFrom: `
      FROM subscriptions
      INNER JOIN sections ON sections.id = subscriptions.section
      INNER JOIN events ON events.id = sections.event
    `
  },
  eventsWithSections: {
    baseColumns: `
    ${eventsColumns},
    ${sectionsColumns}
    `,
    baseFrom: `
      FROM sections
      RIGHT JOIN events ON sections.event = events.id
    `
  },
  user: {
    baseColumns: `
      "user".id,
      "user".name,
      "user".email,
      "user".actor,
      "user"."createdAt",
      "user".activated
    `
  }
} as const;

export const getQuestionMarks = (string: string): string => {
  return string
  .split(",")
  .map((_, index) => `$${index + 1}`) // PostgreSQL uses $1, $2, $3 instead of ?
  .join(", ")
  ;
}

export const columnsToUpdate = (columns: string[]): string => {
  return columns.map((column, index) => `${column}=$${index + 1}`).join(", "); // PostgreSQL uses $1, $2, $3
}

// New helper for PostgreSQL since it returns different result structure
export const extractRows = (result: any): any[] => {
  return result.rows || result;
}

export const extractFirstRow = (result: any): any => {
  const rows = extractRows(result);
  return rows[0] || null;
}