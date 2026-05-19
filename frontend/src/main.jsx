import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Eraser,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "8000" ? "" : "http://127.0.0.1:8000");

const starterPrompts = [
  "Suggest products for hyperpigmentation",
  "Moisturisers for oily acne-prone skin",
  "Sunscreen options under 10 pounds",
  "Now show cheaper options",
];

function getSessionId() {
  const existing = localStorage.getItem("skincare-session-id");
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  localStorage.setItem("skincare-session-id", sessionId);
  return sessionId;
}

function App() {
  const [sessionId] = useState(getSessionId);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I can help you find skincare products and keep follow-up budget questions tied to the same search.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSlowStart, setIsSlowStart] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

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
    if (!isLoading) {
      setIsSlowStart(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setIsSlowStart(true), 7000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  async function sendMessage(messageText = input) {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, session_id: sessionId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "The assistant could not respond.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
        },
      ]);
    } catch (err) {
      setError(err.message);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "I could not reach the assistant. Check that the FastAPI server is running and GEMINI_API_KEY is set, then try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function resetChat() {
    setError("");
    setMessages([
      {
        id: "welcome-reset",
        role: "assistant",
        content: "Memory cleared. Start a fresh skincare search whenever you are ready.",
      },
    ]);

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
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
