import { ResultSetHeader } from "mysql2";
import { MessageType } from "./roomsWebsocketManager";
import { getQuestionMarks, normalResultedQuery } from "./queryManager";

interface MessagesResults {
  id: number;
  message: string;
  time: string;
  volunteer: string;
  organiser: string;
  sender: string;
}

export interface Contact {
  name: string;
  userId: string;
}

const contactColumns = `
  user.name,
  user.id AS userId
`

export class MessagesDatabaseManager {
  private columnsToInsert = "message, time, volunteer, organiser, sender";

  async addMessage(message: MessageType, volunteer: string, organiser: string, sender: string): Promise<ResultSetHeader> {
    const now = new Date();
    return await normalResultedQuery<ResultSetHeader>(
      `INSERT INTO messages(${this.columnsToInsert}) VALUES(${getQuestionMarks(this.columnsToInsert)});`,
      [message.message, now, volunteer, organiser, sender]
    );
  }

  async getMessages(volunteer: string, organiser: string): Promise<MessagesResults[]> {
    return await normalResultedQuery<MessagesResults[]>(
      `SELECT * FROM messages WHERE organiser = ? AND volunteer = ?;`,
      [organiser, volunteer]
    );
  }

  async getContactsForVolunteer(volunteer: string): Promise<Contact[]> {
    const now = new Date();
    return await normalResultedQuery<Contact[]>(
      `SELECT
      ${contactColumns}
      FROM volunteer_requests vr
      INNER JOIN events ON vr.event = events.id
      INNER JOIN user ON events.organizer = user.id
      WHERE vr.volunteer = ? AND vr.verified = TRUE AND user.actor = "organizer" AND events.endsAt > ?;`,
      [volunteer, now]
    );
  }

  async getContactsForOrganiser(organiser: string): Promise<Contact[]> {
    const now = new Date();
    return await normalResultedQuery<Contact[]>(
      `SELECT
      ${contactColumns}
      FROM volunteer_requests vr
      INNER JOIN events ON vr.event = events.id
      INNER JOIN user ON vr.volunteer = user.id
      WHERE events.organizer = ? AND vr.verified = TRUE AND user.actor = "volunteer" AND events.endsAt > ?;`,
      [organiser, now]
    );
  }
}