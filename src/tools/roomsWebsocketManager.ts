import { UserData } from "../utils/auth";
import { WebSocket } from "ws";

interface WebsocketUser {
  webSocket: WebSocket;
  userData: UserData;
}

interface MessageType {
  message: string;
  senderId: string;
  timestamp?: number;
}

interface RoomState {
  users: Map<string, WebsocketUser>; // userId -> user
  messages: MessageType[];
}

class RoomsWebsocketManager {
  private rooms: Map<string, RoomState>;

  constructor() {
    this.rooms = new Map();
  }

  createRoom(id: string): void {
    if (this.rooms.has(id)) return;
    this.rooms.set(id, { users: new Map(), messages: [] });
  }

  removeRoom(id: string): boolean {
    const room = this.rooms.get(id);
    if (room) {
      // Close all connections in the room
      room.users.forEach(user => {
        if (user.webSocket.readyState === WebSocket.OPEN) {
          user.webSocket.close();
        }
      });
    }
    return this.rooms.delete(id);
  }

  joinUserToRoom(roomId: string, user: WebsocketUser): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (user.webSocket.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Setup cleanup on connection close
    this.setupConnectionCleanup(user.webSocket, roomId, user.userData.id);
    
    room.users.set(user.userData.id, user);
    return true;
  }

  removeUserFromRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const removed = room.users.delete(userId);
    
    // Auto-clean empty rooms
    if (room.users.size === 0) {
      this.removeRoom(roomId);
    }
    
    return removed;
  }

  sendMessage(roomId: string, data: MessageType): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Add timestamp and save message
    const messageWithTimestamp = {
      ...data,
      timestamp: Date.now()
    };
    
    room.messages.push(messageWithTimestamp);
    
    // Send to all users
    const messageJson = JSON.stringify(messageWithTimestamp);
    let success = true;
    
    room.users.forEach(user => {
      try {
        if (user.webSocket.readyState === WebSocket.OPEN && user.userData.id != data.senderId) {
          user.webSocket.send(messageJson);
        }
      } catch (error) {
        console.error('Failed to send message to user:', user.userData.id, error);
        success = false;
      }
    });
    
    return success;
  }

  getRoomUsers(roomId: string): WebsocketUser[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.users.values()) : [];
  }

  getRoomMessages(roomId: string): MessageType[] {
    const room = this.rooms.get(roomId);
    return room ? [...room.messages] : [];
  }

  private setupConnectionCleanup(ws: WebSocket, roomId: string, userId: string): void {
    const cleanup = () => this.removeUserFromRoom(roomId, userId);
    
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
  }
}

export { RoomsWebsocketManager, type MessageType, type WebsocketUser };