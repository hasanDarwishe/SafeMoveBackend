// Remove MySQL imports, add PostgreSQL types
// import { ResultSetHeader, RowDataPacket } from "mysql2";
import { 
  columnsToUpdate,
  customResultedQuery, 
  EventInfo, 
  EventResult, 
  EventsColumnsType, 
  EventsWithTheirSectionsResult, 
  GetEventsAndSectionsQueryType, 
  getQuestionMarks, 
  normalResultedQuery,
  queries,
  SectionInfo,
  SectionResult,
  SectionsColumnsType,
  SubscriptionsInfo,
  SubscriptionsResult,
  UserSubscriptions,
  VolunteeringRequestInfo,
  VolunteeringRequestResult,
  VolunteeringRequestResultApi,
  VolunteeringRequestResultWithEventQuery,
  extractRows, // Add this new helper
  extractFirstRow // Add this new helper
} from "./queryManager";
import { UserData } from "../utils/auth";

// PostgreSQL result type
interface QueryResult {
  rowCount: number;
  rows: any[];
  command: string;
}

class EventsManager {

  private getEventsWithSectionsLogic(results: unknown): EventsWithTheirSectionsResult[] {
    const resultsArray = extractRows(results) as GetEventsAndSectionsQueryType[];
    const eventsMap = new Map<number, EventsWithTheirSectionsResult>();
    
    for(const result of resultsArray) {
      if(!eventsMap.get(result.eventId)) {
        eventsMap.set(result.eventId, {
          acceptvolunteers: result.eventAcceptVolunteers,
          createdat: result.eventCreatedAt,
          description: result.eventDescription,
          endsat: result.eventEndsAt,
          id: result.eventId,
          name: result.eventName,
          organiserName: result.organiserName,
          organizer: result.eventOrganiser,
          sections: result.sectionId ? [{
            description: result.sectionDescription,
            event: result.sectionEvent,
            id: result.sectionId,
            maxSubscribers: result.sectionMaxSubscribers,
            name: result.sectionName,
            subscriptions: result.sectionSubscriptions
          }] : []
        });
      }
      else {
        if(result.sectionId) eventsMap.get(result.eventId)!.sections.push({
          description: result.sectionDescription,
          event: result.sectionEvent,
          id: result.sectionId,
          maxSubscribers: result.sectionMaxSubscribers,
          name: result.sectionName,
          subscriptions: result.sectionSubscriptions
        });
      }
    }

    const eventsArray = Array.from(eventsMap.values());
    return eventsArray;
  }

  async createEvent(info: Omit<EventInfo, "organiserName">): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `INSERT INTO events(${queries.events.insertColumns}) VALUES(${getQuestionMarks(queries.events.insertColumns)})`,
      [info.name, info.description, info.createdat, info.organizer, info.endsat, info.acceptvolunteers]
    );
  }

  async getEventsByOrganiser(organiser: string): Promise<EventResult[]> {
    return await normalResultedQuery<EventResult[]>(
      `SELECT
      ${queries.events.baseColumns}
      ${queries.events.baseFrom}
      WHERE events.organizer = $1`,
      [organiser],
    );
  }

  async getEventsAndSectionsByOrganiser(organiser: string): Promise<EventsWithTheirSectionsResult[]> {
    return await customResultedQuery<EventsWithTheirSectionsResult[]>(
      `
      SELECT
        ${queries.eventsWithSections.baseColumns}
        ${queries.eventsWithSections.baseFrom}
      WHERE events.organizer = $1
      `,
      [organiser],
      (results) => this.getEventsWithSectionsLogic(results)
    );
  }

  async getSectionByOrganiser(organiser: string): Promise<SectionResult[]> {
    return await normalResultedQuery<SectionResult[]>(
      `SELECT
      ${queries.sections.baseColumns}
      ${queries.sections.baseFromWithEvents}
      WHERE events.organizer = $1`,
      [organiser],
    );
  }

  async getSectionsByEvent(event: number | string, options: {checkSubscription: false } | {checkSubscription: true; userId: string}={checkSubscription: false}): Promise<(SectionResult & {isSubscribed?: boolean})[]> {
    const params = options.checkSubscription ? [options.userId, event] : [event];
    const placeholders = options.checkSubscription ? ['$1', '$2'] : ['$1'];
    
    return await normalResultedQuery<(SectionResult & {isSubscribed?: boolean})[]>(
      `SELECT
      ${queries.sections.baseColumns}
      ${options.checkSubscription ? ", (SELECT COUNT(*) > 0 FROM subscriptions WHERE subscriptions.participator = $1 AND subscriptions.section = sections.id) AS \"isSubscribed\"" : ""}
      ${queries.sections.baseFrom}
      WHERE sections.event = ${options.checkSubscription ? '$2' : '$1'}`,
      params,
    );
  }

  async createSection(info: SectionInfo): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `INSERT INTO sections(${queries.sections.insertColumns}) VALUES(${getQuestionMarks(queries.sections.insertColumns)})`,
      [info.name, info.description, info.event, info.maxSubscribers],
    );
  }

  async getEvent(eventId: String | number): Promise<EventResult[]> {
    return await normalResultedQuery<EventResult[]>(
      `SELECT
      ${queries.events.baseColumns}
      ${queries.events.baseFrom}
      WHERE events.id=$1`,
      [eventId],
    );
  }

  async deleteEvent(eventId: String | number): Promise<QueryResult> {
    // PostgreSQL doesn't support multi-table DELETE with JOIN in the same way
    // Use CASCADE delete or separate queries
    return await normalResultedQuery<QueryResult>(
      `DELETE FROM events WHERE id = $1`,
      [eventId],
    );
  }

  async getSection(sectionId: String | number): Promise<SectionResult[]> {
    return await normalResultedQuery<SectionResult[]>(
      `SELECT 
      ${queries.sections.baseColumns}
      ${queries.sections.baseFrom}
      WHERE sections.id=$1`,
      [sectionId],
    );
  }

  async deleteSection(sectionId: String | number): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(`DELETE FROM sections WHERE id=$1`, [sectionId]);
  }

  async updateEvent(eventId: string|number, eventInfo: Omit<EventInfo, "organizer" | "createdAt" | "organiserName">): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `UPDATE events SET ${columnsToUpdate(["name", "description", "endsAt", "acceptVolunteers"])} WHERE id=$${["name", "description", "endsAt", "acceptVolunteers"].length + 1}`,
      [eventInfo.name, eventInfo.description, eventInfo.endsat, eventInfo.acceptvolunteers, eventId]
    );
  }

  async updateSection(sectionId: string|number, sectionInfo: Omit<SectionInfo, "event" | "subscriptions">): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `UPDATE sections SET ${columnsToUpdate(["name", "description", "maxSubscribers"])} WHERE id=$${["name", "description", "maxSubscribers"].length + 1}`,
      [sectionInfo.name, sectionInfo.description, sectionInfo.maxSubscribers, sectionId],
    );
  }

  async deleteOtherSections(eventId: number | string, keep: number[]): Promise<boolean> {
    const fetchedSections = await this.getSectionsByEvent(eventId);
    const totalSectionsIds = fetchedSections.map(section => section.id);
    const deletingIds = totalSectionsIds.filter(id => !keep.includes(id));

    if (deletingIds.length === 0) {
      return true;
    }
    
    const placeholders = deletingIds.map((_, index) => `$${index + 1}`).join(', ');
    
    return await customResultedQuery<boolean>(
      `DELETE FROM sections WHERE id IN(${placeholders})`,
      deletingIds,
      (result) => (result as QueryResult).rowCount > 0
    );
  }

  async getEventsThatNeedVolunteers(): Promise<EventResult[]> {
    return await normalResultedQuery<EventResult[]>(
      `SELECT
        ${queries.events.baseColumns}
        ${queries.events.baseFrom}
        WHERE events.acceptVolunteers = TRUE`,
      []
    );
  }

  async getEventsAndSectionsThatNeedVolunteer(): Promise<EventsWithTheirSectionsResult[]> {
    return await customResultedQuery<EventsWithTheirSectionsResult[]>(
      `
      SELECT
        ${queries.eventsWithSections.baseColumns}
        ${queries.eventsWithSections.baseFrom}
      WHERE events.acceptVolunteers = TRUE
      `,
      [],
      (results) => this.getEventsWithSectionsLogic(results)
    );
  }

  async submitVolunteeringRequest(info: VolunteeringRequestInfo): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `INSERT INTO volunteer_requests(${queries.volunteer_requests.insertColumns}) VALUES(${getQuestionMarks(queries.volunteer_requests.insertColumns)})`,
      [info.event, info.volunteer, info.date, info.verified, info.description]
    );
  }

  async getVolunteeringRequestsForOrganiser(organiserId: string): Promise<VolunteeringRequestResultApi[]> {
    return await customResultedQuery<VolunteeringRequestResultApi[]>(
      `SELECT
      ${queries.volunteer_requests.baseColumns}
      ${queries.volunteer_requests.baseFrom}
      WHERE events.organizer = $1 AND events.acceptVolunteers = TRUE`,
      [organiserId],
      (results) => {
        const rows = extractRows(results) as VolunteeringRequestResultWithEventQuery[];
        return rows.map((value) => {
          return {
            date: value.date,
            description: value.description,
            event: {
              acceptvolunteers: value.eventAcceptVolunteers,
              createdat: value.eventCreatedAt,
              description: value.eventDescription,
              endsat: value.eventEndsAt,
              id: value.eventId,
              name: value.eventName,
              organiserName: value.organiserName,
              organizer: value.eventOrganiser,
            },
            id: value.id,
            verified: value.verified,
            volunteer: value.volunteer,
            volunteerName: value.volunteerName,
          } as VolunteeringRequestResultApi;
        })
      }
    );
  }

  async getVolunteeringRequestsForVolunteer(volunteerId: string): Promise<VolunteeringRequestResultApi[]> {
    return await customResultedQuery<VolunteeringRequestResultApi[]>(
      `SELECT
      ${queries.volunteer_requests.baseColumns}
      ${queries.volunteer_requests.baseFrom}
      WHERE volunteer_requests.volunteer = $1 AND events.acceptVolunteers = TRUE`,
      [volunteerId],
      (results) => {
        const rows = extractRows(results) as VolunteeringRequestResultWithEventQuery[];
        return rows.map((value) => {
          return {
            date: value.date,
            description: value.description,
            event: {
              acceptvolunteers: value.eventAcceptVolunteers,
              createdat: value.eventCreatedAt,
              description: value.eventDescription,
              endsat: value.eventEndsAt,
              id: value.eventId,
              name: value.eventName,
              organiserName: value.organiserName,
              organizer: value.eventOrganiser,
            },
            id: value.id,
            verified: value.verified,
            volunteer: value.volunteer,
            volunteerName: value.volunteerName,
          } as VolunteeringRequestResultApi;
        })
      }
    );
  }

  async deleteVolunteeringRequest(requestId: string | number, userId: string): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `DELETE FROM volunteer_requests 
      USING events 
      WHERE volunteer_requests.event = events.id 
      AND volunteer_requests.id = $1 
      AND (events.organizer = $2 OR volunteer_requests.volunteer = $3)`,
      [requestId, userId, userId],
    );
  }

  async confirmVolunteeringRequest(requestId: string | number, organiserId: string, unconfirm: boolean = false): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `UPDATE volunteer_requests 
      SET verified = $1 
      FROM events 
      WHERE volunteer_requests.event = events.id 
      AND volunteer_requests.id = $2 
      AND events.organizer = $3`,
      [!unconfirm, requestId, organiserId],
    );
  }

  async getEventsForUsers(): Promise<EventResult[]> {
    const now = new Date();
    return await normalResultedQuery<EventResult[]>(
      `SELECT
      ${queries.events.baseColumns}
      ${queries.events.baseFrom}
      WHERE events.endsAt > $1
      ORDER BY events.createdAt DESC`,
      [now],
    );
  }

  async getEventsAndSectionsForUsers(): Promise<EventsWithTheirSectionsResult[]> {
    const now = new Date();
    return await customResultedQuery<EventsWithTheirSectionsResult[]>(
      `
      SELECT
        ${queries.eventsWithSections.baseColumns}
        ${queries.eventsWithSections.baseFrom}
      WHERE events.endsAt > $1
      ORDER BY events.createdAt DESC
      `,
      [now],
      (results) => this.getEventsWithSectionsLogic(results)
    );
  }

  async checkIsRequested(userId: string): Promise<boolean> {
    return await customResultedQuery<boolean>(
      `SELECT * FROM volunteer_requests WHERE volunteer = $1`, 
      [userId], 
      (result) => extractRows(result).length > 0
    );
  }

  async addSubscription(sectionId: string | number, participatorId: string): Promise<boolean> {
    const columns = queries.subscriptions.insertColumns;
    const date = new Date();

    return await customResultedQuery<boolean>(
      `INSERT INTO subscriptions(${columns})
      SELECT $1, $2, $3
      WHERE
      (SELECT COUNT(*) FROM subscriptions WHERE section = $4) < (SELECT "maxSubscribers" FROM sections WHERE id=$5)
      LIMIT 1`,
      [sectionId, participatorId, date, sectionId, sectionId],
      (result) => (result as QueryResult).rowCount === 1
    );
  }

  async checkIfUserSubscribedToSection(sectionId: string | number, participatorId: string): Promise<boolean> {
    return await customResultedQuery<boolean>(
      `SELECT * FROM subscriptions WHERE section=$1 AND participator=$2`,
      [sectionId, participatorId],
      (result) => extractRows(result).length > 0
    );
  }

  async deleteSubscription(sectionId: string | number, participatorId: string): Promise<QueryResult> {
    return await normalResultedQuery<QueryResult>(
      `DELETE FROM subscriptions WHERE section=$1 AND participator=$2`,
      [sectionId, participatorId]
    );
  }

  async getUserSubscriptions(userId: string): Promise<UserSubscriptions[]> {
    type UserSubscriptionsQuery = EventsColumnsType & SectionsColumnsType & SubscriptionsInfo & {id: number; isSubscribed: boolean;};

    return await customResultedQuery<UserSubscriptions[]>(
      `
      SELECT
      ${queries.subscriptions.selectWithSectionAndEventsColumns}
      ${queries.subscriptions.selectWithSectionAndEventsFrom}
      WHERE subscriptions.participator = $1
      `,
      [userId],
      (result) => {
        const rows = extractRows(result) as UserSubscriptionsQuery[];
        return rows.map((value) => {
          return {
            date: value.date,
            event: {
              acceptvolunteers: value.eventAcceptVolunteers,
              createdat: value.eventCreatedAt,
              description: value.eventDescription,
              endsat: value.eventEndsAt,
              id: value.eventId,
              name: value.eventName,
              organiserName: value.organiserName,
              organizer: value.eventOrganiser
            },
            id: value.id,
            isSubscribed: value.isSubscribed,
            participator: value.participator,
            section: value.section,
            sectionInfo: {
              description: value.sectionDescription,
              event: value.sectionEvent,
              id: value.sectionId,
              maxSubscribers: value.sectionMaxSubscribers,
              name: value.sectionName,
              subscriptions: value.sectionSubscriptions
            }
          } as UserSubscriptions;
        })
      }
    );
  }

  async getEventSubscribers(eventId: string | number, organiser: string): Promise<(UserData & {sectionName: string})[]> {
    return await normalResultedQuery<(UserData & {sectionName: string})[]>(
      `SELECT
      ${queries.user.baseColumns},
      sections.name AS "sectionName"
      FROM subscriptions
      INNER JOIN sections ON sections.id = subscriptions.section
      INNER JOIN "user" ON subscriptions.participator = "user".id
      WHERE (SELECT organizer FROM events WHERE id=$1) = $2 AND "user".actor = 'user'
      ORDER BY sections.name`,
      [eventId, organiser]
    );
  }

  async kickSubscriber(eventId: string | number, organiser: string, user: string): Promise<QueryResult> {
    return await normalResultedQuery(
      `
      DELETE FROM subscriptions 
      WHERE (SELECT organizer FROM events WHERE id=$1) = $2
      AND subscriptions.participator = $3`,
      [eventId, organiser, user]
    );
  }

  async getVolunteersOfEvent(eventId: string | number, organiser: string): Promise<UserData[]> {
    return await normalResultedQuery<UserData[]>(
      `SELECT
      ${queries.user.baseColumns}
      FROM volunteer_requests
      INNER JOIN "user" ON "user".id = volunteer_requests.volunteer
      INNER JOIN events ON events.id = volunteer_requests.event
      WHERE events.id=$1 AND events.organizer=$2 AND volunteer_requests.verified = TRUE`,
      [eventId, organiser]
    );
  }
}

export { EventsManager };