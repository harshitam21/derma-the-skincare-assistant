import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Eraser,
  History,
  LogIn,
  LogOut,
  Loader2,
  Lock,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, hasFirebaseConfig } from "./firebase";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const googleProvider = new GoogleAuthProvider();

const starterPrompts = [
  "Suggest products for hyperpigmentation",
  "Moisturisers for oily acne-prone skin",
  "Sunscreen options under 10 pounds",
  "Now show cheaper options",
];

const HISTORY_STORAGE_KEY = "skincare-chat-history";

function historyStorageKey(user) {
  return `${HISTORY_STORAGE_KEY}:${user.uid}`;
}

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

function loadConversations(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    localStorage.removeItem(storageKey);
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
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(undefined);
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
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setActiveConversationId(undefined);
      return;
    }

    const nextConversations = loadConversations(historyStorageKey(user));
    setConversations(nextConversations);
    setActiveConversationId(nextConversations[0]?.id);
    setInput("");
    setError("");
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (user && conversations.length > 0) {
      localStorage.setItem(historyStorageKey(user), JSON.stringify(conversations));
    }
  }, [conversations, user]);

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

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, response));
      }

      if (!data?.answer) {
        throw new Error("The assistant returned an empty response.");
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

  async function handleSignOut() {
    setError("");
    await signOut(auth);
  }

  if (!hasFirebaseConfig) {
    return <MissingFirebaseConfig />;
  }

  if (!authReady) {
    return (
      <main className="app-shell">
        <div className="auth-panel compact-auth">
          <Loader2 size={22} className="spin" />
          <span>Preparing sign in...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthView />;
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
              <p>{statusText} · {user.email}</p>
            </div>
          </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" onClick={resetChat} title="Clear chat memory">
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" onClick={handleSignOut} title="Sign out">
                <LogOut size={18} />
              </button>
            </div>
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

function MissingFirebaseConfig() {
  return (
    <main className="app-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <div>
            <h1>Firebase setup needed</h1>
            <p>Add `VITE_FIREBASE_API_KEY` to your project-root `.env` file and rebuild the frontend.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      return { detail: text };
    }
    throw new Error("The assistant returned a response that was not valid JSON.");
  }
}

function apiErrorMessage(data, response) {
  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (Array.isArray(data?.detail)) {
    return data.detail.map((item) => item.msg || item.message || String(item)).join(" ");
  }

  return `The assistant could not respond. API returned ${response.status} ${response.statusText || ""}`.trim();
}

function AuthView() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "signup";

  async function saveUserLogin(firebaseUser, extra = {}) {
    await setDoc(
      doc(db, "users", firebaseUser.uid),
      {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || extra.displayName || "",
        lastLoginAt: serverTimestamp(),
        ...extra,
      },
      { merge: true },
    );
  }

  useEffect(() => {
    let isActive = true;

    async function completeGoogleRedirect() {
      try {
        const credential = await getRedirectResult(auth);
        if (!isActive || !credential?.user) return;

        await saveUserLogin(credential.user, {
          displayName: credential.user.displayName || "",
        });
      } catch (err) {
        if (isActive) {
          setAuthError(authErrorMessage(err));
        }
      }
    }

    completeGoogleRedirect();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    try {
      if (isSignup) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const displayName = name.trim();
        if (displayName) {
          await updateProfile(credential.user, { displayName });
        }
        await saveUserLogin(credential.user, {
          displayName,
          createdAt: serverTimestamp(),
        });
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        await saveUserLogin(credential.user);
      }
    } catch (err) {
      setAuthError(authErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setAuthError("");
    setIsSubmitting(true);

    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      setAuthError(authErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel" aria-label="Account access">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <div>
            <h1>Skincare Assistant</h1>
            <p>{isSignup ? "Create an account to start chatting." : "Sign in to continue your skincare chats."}</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={!isSignup ? "active" : ""}
            onClick={() => {
              setMode("login");
              setAuthError("");
            }}
          >
            <LogIn size={17} />
            <span>Login</span>
          </button>
          <button
            type="button"
            className={isSignup ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setAuthError("");
            }}
          >
            <UserPlus size={17} />
            <span>Sign up</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleAuthSubmit}>
          {isSignup && (
            <label className="field">
              <span>Name</span>
              <div className="field-control">
                <UserRound size={18} />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <div className="field-control">
              <Mail size={18} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="field-control">
              <Lock size={18} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            </div>
          </label>

          {authError && (
            <div className="error-bar auth-error" role="alert">
              {authError}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={18} className="spin" /> : isSignup ? <UserPlus size={18} /> : <LogIn size={18} />}
            <span>{isSubmitting ? "Please wait" : isSignup ? "Create account" : "Login"}</span>
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button className="google-auth-button" type="button" onClick={handleGoogleSignIn} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={18} className="spin" /> : <GoogleMark />}
          <span>Continue with Google</span>
        </button>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function authErrorMessage(err) {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try logging in instead.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The email or password is incorrect.";
    case "auth/weak-password":
      return "Use a password with at least 6 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before it finished.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Allow popups and try again.";
    case "auth/unauthorized-domain":
      return `Firebase has not authorized this domain: ${window.location.hostname}. Add it in Firebase Authentication settings.`;
    default:
      return err?.message || "Authentication failed. Please try again.";
  }
}

createRoot(document.getElementById("root")).render(<App />);
