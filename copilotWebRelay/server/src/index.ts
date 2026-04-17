import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { CopilotClient, approveAll } from "@github/copilot-sdk";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Per-connection Copilot session management
wss.on("connection", async (ws: WebSocket) => {
  console.log("🔌 New WebSocket connection");

  let client: CopilotClient | null = null;
  let session: any = null;

  try {
    client = new CopilotClient();

    session = await client.createSession({
      model: "gpt-4.1",
      streaming: true,
      onPermissionRequest: approveAll,
    });

    console.log(`✅ Session created: ${session.sessionId}`);
    ws.send(JSON.stringify({ type: "connected", sessionId: session.sessionId }));

    // Set up streaming event handlers
    session.on("assistant.message_delta", (event: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "delta",
          content: event.data.deltaContent,
        }));
      }
    });

    session.on("session.idle", () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "idle" }));
      }
    });

    // Handle incoming messages from client
    ws.on("message", async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "chat" && msg.content) {
          console.log(`💬 User: ${msg.content.substring(0, 50)}...`);
          await session.send({ prompt: msg.content });
        }
      } catch (err) {
        console.error("Error processing message:", err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "Failed to process message" }));
        }
      }
    });

  } catch (err) {
    console.error("Failed to create Copilot session:", err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", message: "Failed to initialize Copilot session" }));
    }
  }

  // Clean up on disconnect
  ws.on("close", async () => {
    console.log("🔌 WebSocket disconnected");
    try {
      if (session) await session.disconnect();
      if (client) await client.stop();
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready on ws://localhost:${PORT}`);
});
