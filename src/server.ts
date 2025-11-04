import express from "express";
import dotenv from "dotenv";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth, UserData } from "./utils/auth";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import WebSocket from "ws";
import { createServer, IncomingMessage } from "http";
import { errorMessager, internalServerErrorMessager } from "./utils/messager";

import signinRoute from "./routes/signin";
import eventsRoute from "./routes/events";
import adminsRoute from "./routes/admin" ;
import chatsRoute  from "./routes/chats" ;
import { RoomsWebsocketManager } from "./tools/roomsWebsocketManager";
import { MessagesDatabaseManager } from "./tools/messagesDatabaseManager";

dotenv.config();
const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ 
  server,
  verifyClient: async (info, done) => {
    try {
      const session = await auth.api.getSession({ 
        headers: fromNodeHeaders(info.req.headers) 
      });
      
      if (session?.user) {
        (info.req as any).user = session.user; // Attach user to request
        if(!session.user.activated) done(false, 401, "Your account got deactivated by admins");
        else done(true);
      } else {
        console.log("WebSocket connection rejected at handshake");
        done(false, 401, "Unauthorized");
      }
    } catch (error) {
      console.log("WebSocket verifyClient error:", error);
      done(false, 401, "Authentication failed");
    }
  }
});


app.use(helmet());
app.all('/api/auth/{*any}', toNodeHandler(auth));
app.use(express.json({
  limit: "100kb",
  strict: true,
}));
app.use(cors({
  credentials: true,
  methods: ["POST", "GET", "DELETE"],
}));
app.use(rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use("/", signinRoute);
app.use("/events", eventsRoute);
app.use("/admin", adminsRoute);
app.use("/chats", chatsRoute);

interface ErrorType {
  id?: number,
  message: string,
  status: number
}

type ResponseType = {
  error: true,
  data : ErrorType,
} | {
  error: false,
  data?: any,
}

export type { ErrorType, ResponseType };

app.get("/", (req, res) => {
  return res.json({
    error: false,
    data: "why are you gay?",
  });
});

app.use((req, res) => {
  return errorMessager(res, "Route not found", 404);
});

app.use((error: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', error);
  return internalServerErrorMessager(res);
});

type arrivedData = ({
  type: "join";
} | {
  type: "message";
  message: string;
}) & {contact: string;}

const dbManager = new MessagesDatabaseManager();
const roomManager = new RoomsWebsocketManager();

wss.on("connection", async (ws, req: IncomingMessage & {user: UserData}) => {
  console.log("A new connection established, user name:", req.user.name);

  ws.on("message", (data: Buffer) => {
    const parsedData: arrivedData = JSON.parse(data.toString());

    const volunteerId = req.user.actor == "volunteer" ? req.user.id : parsedData.contact;
    const organiserId = req.user.actor == "organizer" ? req.user.id : parsedData.contact;
    const roomId = organiserId + volunteerId;
    if(parsedData.type == "join") {
      const joined = roomManager.joinUserToRoom(roomId, {
        userData: req.user,
        webSocket: ws
      });
      if(!joined) {
        roomManager.createRoom(roomId);
        roomManager.joinUserToRoom(roomId, {
          userData: req.user,
          webSocket: ws
        });
      }

      console.log(roomId)
    }
    else if(parsedData.type == "message") {
      dbManager.addMessage({
        message: parsedData.message,
        senderId: req.user.id,
        timestamp: Date.now()
      }, volunteerId, organiserId, req.user.id);
      roomManager.sendMessage(roomId, {
        message: parsedData.message,
        senderId: req.user.id,
        timestamp: Date.now()
      });
    }
    else {
      console.log("Nothing type");
    }
  })

  ws.on("close", () => {
    console.log("Websocket connection closed");
  });

  ws.on("error", (error) => {
    console.error("Error with websocket:", error.message);
  });
});

server.listen(Number(process.env.PORT) || 6969, "0.0.0.0", () => {
  console.log(`Successfully launched the server at:`);
  console.log(`- Local: ${process.env.BETTER_AUTH_URL}`);
  console.log(`- Public: http://192.168.1.9:${process.env.PORT}`);
  console.log(`- Websocket: ws://192.168.1.9:${process.env.PORT}\n`);
});