import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Eraser,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  window.location.port !== "8000"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "");

const starterPrompts = [
  "Suggest products for hyperpigmentation",
  "Moisturisers for oily acne-prone skin",
  "Sunscreen options under 10 pounds",
  "Now show cheaper options",
];

const HISTORY_STORAGE_KEY = "skincare-chat-history";

function welcomeMessage(id = "welcome") {
  return {
    id,
    role: "assistant",
    content:
      "Hi, I can help you find skincare products and keep follow-up budget questions tied to the same search.",
  };
}

function createConversation() {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [welcomeMessage()],
  };
}

function loadConversations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }

  return [createConversation()];
}

function chatTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "New chat";
  return firstUserMessage.content.length > 42
    ? `${firstUserMessage.content.slice(0, 42)}...`
    : firstUserMessage.content;
}

function formatHistoryTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function App() {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState(
    () => conversations[0]?.id,
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSlowStart, setIsSlowStart] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0],
    [activeConversationId, conversations],
  );
  const messages = activeConversation?.messages || [];
  const sessionId = activeConversation?.sessionId || "default";
  const canSend = input.trim().length > 0 && !isLoading;

  const statusText = useMemo(() => {
    if (isLoading) return "Searching products";
    if (error) return "Needs attention";
    return "Ready";
  }, [error, isLoading]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (!isLoading) {
      setIsSlowStart(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setIsSlowStart(true), 7000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  function updateConversation(conversationId, updater) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const updatedConversation = updater(conversation);
        return {
          ...updatedConversation,
          title: chatTitle(updatedConversation.messages),
          updatedAt: Date.now(),
        };
      }),
    );
  }

  function updateActiveConversation(updater) {
    updateConversation(activeConversationId, updater);
  }

  async function sendMessage(messageText = input) {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading || !activeConversation) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const conversationId = activeConversation.id;
    const requestSessionId = activeConversation.sessionId;

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, userMessage],
    }));
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, session_id: requestSessionId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "The assistant could not respond.");
      }

      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.answer,
          },
        ],
      }));
    } catch (err) {
      setError(err.message);
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `I could not reach the assistant. ${err.message}`,
          },
        ],
      }));
    } finally {
      setIsLoading(false);
    }
  }

  function startNewChat() {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setInput("");
    setError("");
  }

  function deleteConversation(conversationId) {
    setConversations((current) => {
      const remaining = current.filter((conversation) => conversation.id !== conversationId);
      if (remaining.length === 0) {
        const conversation = createConversation();
        setActiveConversationId(conversation.id);
        return [conversation];
      }

      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
      return remaining;
    });
  }

  async function resetChat() {
    const resetMessage = {
      id: "welcome-reset",
      role: "assistant",
      content: "Memory cleared. Start a fresh skincare search whenever you are ready.",
    };
    setError("");
    updateActiveConversation((conversation) => ({
      ...conversation,
      messages: [resetMessage],
      title: "New chat",
    }));

    try {
      await fetch(`${API_BASE_URL}/api/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      setError("The visible chat was cleared, but the API reset did not complete.");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="app-shell">
      <div className="chat-layout">
        <aside className="history-panel" aria-label="Chat history">
          <div className="history-header">
            <div className="history-title">
              <History size={18} />
              <span>History</span>
            </div>
            <button className="icon-button" type="button" onClick={startNewChat} title="New chat">
              <Plus size={18} />
            </button>
          </div>

          <div className="history-list">
            {conversations.map((conversation) => (
              <div
                className={`history-item ${conversation.id === activeConversationId ? "active" : ""}`}
                key={conversation.id}
              >
                <button
                  type="button"
                  className="history-select"
                  onClick={() => {
                    if (!isLoading) {
                      setActiveConversationId(conversation.id);
                      setInput("");
                      setError("");
                    }
                  }}
                  disabled={isLoading}
                >
                  <span>{conversation.title}</span>
                  <small>{formatHistoryTime(conversation.updatedAt)}</small>
                </button>
                <button
                  className="history-delete"
                  type="button"
                  onClick={() => deleteConversation(conversation.id)}
                  disabled={isLoading}
                  title="Delete chat"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="chat-workspace" aria-label="Skincare assistant chat">
          <header className="topbar">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true">
                <Sparkles size={20} />
              </div>
              <div>
                <h1>Skincare Assistant</h1>
                <p>{statusText}</p>
              </div>
            </div>
            <button className="icon-button" type="button" onClick={resetChat} title="Clear chat memory">
              <RotateCcw size={18} />
            </button>
          </header>

          <div className="prompt-strip" aria-label="Starter prompts">
            {starterPrompts.map((prompt) => (
              <button
                type="button"
                key={prompt}
                className="prompt-chip"
                onClick={() => sendMessage(prompt)}
                disabled={isLoading}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <article className={`message-row ${message.role}`} key={message.id}>
                <div className="avatar" aria-hidden="true">
                  {message.role === "assistant" ? <Bot size={18} /> : <UserRound size={18} />}
                </div>
                <div className="bubble">
                  {message.content.split("\n").map((line, index) => (
                    <p key={`${message.id}-${index}`}>{line}</p>
                  ))}
                </div>
              </article>
            ))}

            {isLoading && (
              <article className="message-row assistant">
                <div className="avatar" aria-hidden="true">
                  <Bot size={18} />
                </div>
                <div className="bubble loading-bubble">
                  <Loader2 size={18} className="spin" />
                  <span>
                    {isSlowStart
                      ? "Still working. The first reply can take a minute while models warm up..."
                      : "Looking through matching products..."}
                  </span>
                </div>
              </article>
            )}
            <div ref={scrollRef} />
          </div>

          {error && (
            <div className="error-bar" role="alert">
              {error}
            </div>
          )}

          <form className="composer" onSubmit={handleSubmit}>
            <button className="icon-button subtle" type="button" onClick={() => setInput("")} title="Clear input">
              <Eraser size={18} />
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask for products, then follow up with budget..."
              rows={1}
            />
            <button className="send-button" type="submit" disabled={!canSend} title="Send message">
              <Send size={18} />
              <span>Send</span>
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
