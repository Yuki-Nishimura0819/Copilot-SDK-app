import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { CopilotClient, approveAll } from "@github/copilot-sdk";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.get("/", (_req, res) => {
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Copilot Web Relay</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0d1117;
        color: #e6edf3;
        display: grid;
        min-height: 100vh;
        place-items: center;
      }
      main {
        width: min(640px, calc(100vw - 32px));
        padding: 32px;
        border: 1px solid #30363d;
        border-radius: 16px;
        background: #161b22;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin-top: 0;
        font-size: 1.75rem;
      }
      p {
        line-height: 1.6;
      }
      a {
        color: #58a6ff;
      }
      code {
        padding: 0.15rem 0.35rem;
        border-radius: 6px;
        background: #0d1117;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Copilot Web Relay Server</h1>
      <p>This port is the backend API and WebSocket server.</p>
      <p>Open the client app at <a href="${frontendUrl}">${frontendUrl}</a>.</p>
      <p>Health check: <a href="/health">/health</a></p>
      <p>If you want a different client URL, set <code>FRONTEND_URL</code> before starting the server.</p>
    </main>
  </body>
</html>`);
});

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
