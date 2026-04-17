import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentAssistantIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const connectWebSocket = useCallback(() => {
    setStatus("connecting");

    // Connect to backend WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = import.meta.env.DEV
      ? `${protocol}//${window.location.host}/ws`
      : `${protocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "connected":
          setStatus("connected");
          break;

        case "delta": {
          const assistantId = currentAssistantIdRef.current;
          if (assistantId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + data.content }
                  : msg
              )
            );
          }
          break;
        }

        case "idle":
          setIsProcessing(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentAssistantIdRef.current
                ? { ...msg, isStreaming: false }
                : msg
            )
          );
          currentAssistantIdRef.current = null;
          break;

        case "error":
          setIsProcessing(false);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠️ Error: ${data.message}`,
            },
          ]);
          currentAssistantIdRef.current = null;
          break;
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      console.log("WebSocket disconnected");
      // Auto-reconnect after 3 seconds
      setTimeout(() => connectWebSocket(), 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return ws;
  }, []);

  useEffect(() => {
    const ws = connectWebSocket();
    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !wsRef.current || status !== "connected" || isProcessing) return;

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    // Create placeholder for assistant response
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    currentAssistantIdRef.current = assistantId;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsProcessing(true);

    wsRef.current.send(JSON.stringify({ type: "chat", content: trimmed }));

    // Refocus input
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as FormEvent);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <p>Start a conversation with Copilot</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div
                className={`message-content ${
                  msg.isStreaming ? "streaming-cursor" : ""
                }`}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || "​"}
                  </ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="status-bar">
          <span
            className={`status-dot ${status}`}
          />
          <span>
            {status === "connected"
              ? "Connected to Copilot"
              : status === "connecting"
              ? "Connecting..."
              : "Disconnected"}
          </span>
        </div>
        <form className="chat-input-form" onSubmit={sendMessage}>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            disabled={status !== "connected"}
            rows={1}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim() || status !== "connected" || isProcessing}
          >
            {isProcessing ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Chat;
