import { ResultSetHeader, RowDataPacket } from "mysql2";
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
  VolunteeringRequestResultWithEventQuery
} from "./queryManager";
import { UserData } from "../utils/auth";

class EventsManager {

  private getEventsWithSectionsLogic(results: unknown): EventsWithTheirSectionsResult[] {
    const eventsMap = new Map<number, EventsWithTheirSectionsResult>();
    for(const result of (results as GetEventsAndSectionsQueryType[])) {
      if(!eventsMap.get(result.eventId)) {
        eventsMap.set(result.eventId, {
          acceptVolunteers: result.eventAcceptVolunteers,
          createdAt: result.eventCreatedAt,
          description: result.eventDescription,
          endsAt: result.eventEndsAt,
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

  async createEvent(info: Omit<EventInfo, "organiserName">): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `INSERT INTO events(${queries.events.insertColumns}) VALUES(${getQuestionMarks(queries.events.insertColumns)});`,
      [info.name, info.description, info.createdAt, info.organizer, info.endsAt, info.acceptVolunteers]
    );
  }

  async getEventsByOrganiser(organiser: string): Promise<EventResult[]> {
    return await normalResultedQuery<EventResult[]>(
      `SELECT
      ${queries.events.baseColumns}
      ${queries.events.baseFrom}
      WHERE events.organizer = ?;`,
      [organiser],
    );
  }

  async getEventsAndSectionsByOrganiser(organiser: string): Promise<EventsWithTheirSectionsResult[]> {

    return await customResultedQuery<EventsWithTheirSectionsResult[]>(
      `
      SELECT
        ${queries.eventsWithSections.baseColumns}
        ${queries.eventsWithSections.baseFrom}
      WHERE events.organizer = ?
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
      WHERE events.organizer = ?;`,
      [organiser],
    );
  }

  async getSectionsByEvent(event: number | string, options: {checkSubscription: false } | {checkSubscription: true; userId: string}={checkSubscription: false}): Promise<(SectionResult & {isSubscribed?: boolean})[]> {
    return await normalResultedQuery<(SectionResult & {isSubscribed?: boolean})[]>(
      `SELECT
      ${queries.sections.baseColumns}
      ${options.checkSubscription ? ", (SELECT COUNT(*) > 0 FROM subscriptions WHERE subscriptions.participator = ? AND subscriptions.section = sections.id) AS isSubscribed" : ""}
      ${queries.sections.baseFrom}
      WHERE sections.event = ?;`,
      (options.checkSubscription ? [options.userId] : new Array(0)).concat(event),
    );
  }

  async createSection(info: SectionInfo): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `INSERT INTO sections(${queries.sections.insertColumns}) VALUES(${getQuestionMarks(queries.sections.insertColumns)});`,
      [info.name, info.description, info.event, info.maxSubscribers],
    );
  }

  async getEvent(eventId: String | number): Promise<EventResult[]> {
    return await normalResultedQuery<EventResult[]>(
      `SELECT
      ${queries.events.baseColumns}
      ${queries.events.baseFrom}
      WHERE events.id=?`,
      [eventId],
    );
  }

  async deleteEvent(eventId: String | number): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `DELETE events, sections, volunteer_requests
      FROM events
      LEFT JOIN sections ON events.id = sections.event
      LEFT JOIN volunteer_requests ON events.id = volunteer_requests.event
      WHERE events.id = ?;
      `,
      [eventId],
    );
  }

  async getSection(sectionId: String | number): Promise<SectionResult[]> {
    return await normalResultedQuery<SectionResult[]>(
      `SELECT 
      ${queries.sections.baseColumns}
      ${queries.sections.baseFrom}
      WHERE sections.id=?`,
      [sectionId],
    );
  }

  async deleteSection(sectionId: String | number): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(`DELETE FROM sections WHERE id=?`, [sectionId]);
  }

  async updateEvent(eventId: string|number, eventInfo: Omit<EventInfo, "organizer" | "createdAt" | "organiserName">): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `UPDATE events SET ${columnsToUpdate(["name", "description", "endsAt", "acceptVolunteers"])} WHERE id=?`,
      [eventInfo.name, eventInfo.description, eventInfo.endsAt, eventInfo.acceptVolunteers, eventId]
    );
  }

  async updateSection(sectionId: string|number, sectionInfo: Omit<SectionInfo, "event" | "subscriptions">): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `UPDATE sections SET ${columnsToUpdate(["name", "description", "maxSubscribers"])} WHERE id=?`,
      [sectionInfo.name, sectionInfo.description, sectionInfo.maxSubscribers, sectionId],
    );
  }

  async deleteOtherSections(eventId: number | string, keep: number[]): Promise<boolean> {
    const fetchedSections = await this.getSectionsByEvent(eventId);
    const totalSectionsIds = fetchedSections.map(section => section.id);
    const deletingIds = totalSectionsIds.filter(id => !keep.includes(id));

    // If nothing to delete, return early
    if (deletingIds.length === 0) {
      return true;
    }
    
    return await customResultedQuery<boolean>(
      `DELETE FROM sections WHERE id IN(${deletingIds.map(() => "?").join(", ")});`,
      deletingIds,
      () => true
    );
  }

  async getEventsThatNeedVolunteers(): Promise<EventResult[]> {
    return await normalResultedQuery<EventResult[]>(
      `SELECT
        ${queries.events.baseColumns}
        ${queries.events.baseFrom}
        WHERE events.acceptVolunteers = TRUE;
      `, []
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

  async submitVolunteeringRequest(info: VolunteeringRequestInfo): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `INSERT INTO volunteer_requests(${queries.volunteer_requests.insertColumns}) VALUES(${getQuestionMarks(queries.volunteer_requests.insertColumns)});`,
      [info.event, info.volunteer, info.date, info.verified, info.description]
    );
  }

  async getVolunteeringRequestsForOrganiser(organiserId: string): Promise<VolunteeringRequestResultApi[]> {
    return await customResultedQuery<VolunteeringRequestResultApi[]>(
      `SELECT
      ${queries.volunteer_requests.baseColumns}
      ${queries.volunteer_requests.baseFrom}
      WHERE events.organizer = ? AND events.acceptVolunteers = TRUE;`,
      [organiserId],
      (results) => (results as VolunteeringRequestResultWithEventQuery[]).map((value) => {
        return {
          date: value.date,
          description: value.description,
          event: {
            acceptVolunteers: value.eventAcceptVolunteers,
            createdAt: value.eventCreatedAt,
            description: value.eventDescription,
            endsAt: value.eventEndsAt,
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
    );
  }

  async getVolunteeringRequestsForVolunteer(volunteerId: string): Promise<VolunteeringRequestResultApi[]> {
    return await customResultedQuery<VolunteeringRequestResultApi[]>(
      `SELECT
      ${queries.volunteer_requests.baseColumns}
      ${queries.volunteer_requests.baseFrom}
      WHERE volunteer_requests.volunteer = ? AND events.acceptVolunteers = TRUE;`,
      [volunteerId],
      (results) => (results as VolunteeringRequestResultWithEventQuery[]).map((value) => {
        return {
          date: value.date,
          description: value.description,
          event: {
            acceptVolunteers: value.eventAcceptVolunteers,
            createdAt: value.eventCreatedAt,
            description: value.eventDescription,
            endsAt: value.eventEndsAt,
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
    );
  }

  async deleteVolunteeringRequest(requestId: string | number, userId: string): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `DELETE vr FROM volunteer_requests vr
      INNER JOIN events e ON vr.event = e.id
      WHERE vr.id = ? AND (e.organizer = ? OR vr.volunteer = ?)`,
      [requestId, userId, userId],
    );
  }

  async confirmVolunteeringRequest(requestId: string | number, organiserId: string, unconfirm: boolean = false): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `UPDATE volunteer_requests 
      INNER JOIN events ON volunteer_requests.event = events.id 
      SET volunteer_requests.verified = ? 
      WHERE volunteer_requests.id = ? AND events.organizer = ?;`,
      [!unconfirm, requestId, organiserId],
    );
  }

  async getEventsForUsers(): Promise<EventResult[]> {
    const now = new Date();
    return await normalResultedQuery<EventResult[]>(
      `SELECT
      ${queries.events.baseColumns}
      ${queries.events.baseFrom}
      WHERE events.endsAt > ?
      ORDER BY events.createdAt DESC;`,
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
      WHERE events.endsAt > ?
      ORDER BY events.createdAt DESC;
      `,
      [now],
      (results) => this.getEventsWithSectionsLogic(results)
    );
  }

  // Checking if the user has requested any volunteering requests:
  async checkIsRequested(userId: string): Promise<boolean> {
    return await customResultedQuery<boolean>(`SELECT * FROM volunteer_requests WHERE volunteer = ?;`, [userId], (result) => (result as VolunteeringRequestResult[]).length > 0);
  }

  async addSubscription(sectionId: string | number, participatorId: string): Promise<boolean> {
    const columns = queries.subscriptions.insertColumns;
    const date = new Date();

    return await customResultedQuery<boolean>(
      `INSERT INTO subscriptions(${columns})
      SELECT ${getQuestionMarks(columns)} FROM DUAL
      WHERE
      (SELECT COUNT(*) FROM subscriptions WHERE section = ?) < (SELECT maxSubscribers FROM sections WHERE id=?)
      LIMIT 1
      ;`,
      [sectionId, participatorId, date, sectionId, sectionId],
      (result) => (result as ResultSetHeader).affectedRows === 1
    );
  }

  async checkIfUserSubscribedToSection(sectionId: string | number, participatorId: string): Promise<boolean> {
    return await customResultedQuery<boolean>(
      `SELECT * FROM subscriptions WHERE section=? AND participator=?;`,
      [sectionId, participatorId],
      (result) => (result as SubscriptionsResult[]).length > 0
    );
  }

  async deleteSubscription(sectionId: string | number, participatorId: string): Promise<ResultSetHeader> {
    return await normalResultedQuery<ResultSetHeader>(
      `DELETE FROM subscriptions WHERE section=? AND participator=?;`,
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
      WHERE subscriptions.participator = ?;
      `,
      [userId],
      (result) => (result as UserSubscriptionsQuery[]).map((value) => {
        return {
          date: value.date,
          event: {
            acceptVolunteers: value.eventAcceptVolunteers,
            createdAt: value.eventCreatedAt,
            description: value.eventDescription,
            endsAt: value.eventEndsAt,
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
    );
  }

  async getEventSubscribers(eventId: string | number, organiser: string): Promise<(UserData & {sectionName: string})[]> {
    return await normalResultedQuery<(UserData & {sectionName: string})[]>(
      `SELECT
      ${queries.user.baseColumns},
      sections.name AS sectionName
      FROM subscriptions
      INNER JOIN sections ON sections.id = subscriptions.section
      INNER JOIN user ON subscriptions.participator = user.id
      WHERE (SELECT organizer FROM events WHERE id=?) = ? AND user.actor = "user"
      ORDER BY sections.name;
      `,
      [eventId, organiser]
    );
  }

  async kickSubscriber(eventId: string | number, organiser: string, user: string): Promise<ResultSetHeader> {
    return await normalResultedQuery(
      `
      DELETE FROM subscriptions 
      WHERE (SELECT organizer FROM events WHERE id=?) = ?
      AND subscriptions.participator = ?
      ;`,
      [eventId, organiser, user]
    );
  }

  async getVolunteersOfEvent(eventId: string | number, organiser: string): Promise<UserData[]> {
    return await normalResultedQuery<UserData[]>(
      `SELECT
      ${queries.user.baseColumns}
      FROM volunteer_requests
      INNER JOIN user ON user.id = volunteer_requests.volunteer
      INNER JOIN events ON events.id = volunteer_requests.event
      WHERE events.id=? AND events.organizer=? AND volunteer_requests.verified = TRUE;
      `,
      [eventId, organiser]
    );
  }
}

export { EventsManager };