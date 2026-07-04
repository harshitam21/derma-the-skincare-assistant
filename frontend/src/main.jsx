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
  X,
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  linkWithCredential,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
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

function PrivacyPolicyModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="privacy-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div className="privacy-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="privacy-modal-header">
          <h2 id="privacy-title">Privacy Policy</h2>
          <button type="button" className="privacy-close-btn" onClick={onClose} title="Close modal">
            <X size={20} />
          </button>
        </header>
        <div className="privacy-modal-body">
          <p><strong>Last Updated: July 5, 2026</strong></p>
          <p>Your privacy is important to us. This Privacy Policy describes how Skincare Assistant collects, uses, and discloses your information.</p>
          
          <h3>1. Information We Collect</h3>
          <ul>
            <li><strong>Account Information:</strong> When you sign up using email or Google Authentication, we collect your email address, name, and profile metadata via Firebase Authentication.</li>
            <li><strong>Chat logs:</strong> We collect and temporary process your text queries and responses to recommend skincare products and enable contextual follow-up.</li>
          </ul>

          <h3>2. How We Use Information</h3>
          <ul>
            <li>To retrieve appropriate skincare products and analyze skin routines via the assistant engine.</li>
            <li>To match queries with product profiles stored in Pinecone indexes.</li>
            <li>To authenticate you and associate history records with your account.</li>
          </ul>

          <h3>3. Third-Party Services</h3>
          <p>Our app processes data through Firebase (Authentication and Firestore databases), Google Gemini API (Model Inference), and Pinecone (Vector database lookup). We do not sell or trade your personal information.</p>

          <h3>4. Security & Data Retention</h3>
          <p>Your search history remains associated with your account on Firestore and local browser storage. You can delete individual chats or reset memory at any time.</p>
        </div>
      </div>
    </div>
  );
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
  const [showPrivacy, setShowPrivacy] = useState(false);
  const scrollRef = useRef(null);

  // Phase 1 Onboarding & Skin Profile State
  const [skinType, setSkinType] = useState("");
  const [skinConcerns, setSkinConcerns] = useState("");
  const [preferences, setPreferences] = useState("");
  const [age, setAge] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);

  // Phase 2 Routines State
  const [routineAM, setRoutineAM] = useState([]);
  const [routinePM, setRoutinePM] = useState([]);
  const [activeTab, setActiveTab] = useState("chat"); // 'chat', 'routine', 'analyzer'

  // Phase 4 Dark Mode Theme State
  const [darkTheme, setDarkTheme] = useState(() => {
    return localStorage.getItem("skincare-theme") === "dark";
  });

  // Expose privacy modal globally so AuthView can open it
  useEffect(() => {
    window.showPrivacyPolicy = () => setShowPrivacy(true);
    return () => {
      delete window.showPrivacyPolicy;
    };
  }, []);

  // Sync theme to document body
  useEffect(() => {
    if (darkTheme) {
      document.documentElement.classList.add("dark-theme");
      localStorage.setItem("skincare-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark-theme");
      localStorage.setItem("skincare-theme", "light");
    }
  }, [darkTheme]);

  // Load User Profile & Routine data from Firestore when user log in
  useEffect(() => {
    if (!user) {
      setSkinType("");
      setSkinConcerns("");
      setPreferences("");
      setAge("");
      setRoutineAM([]);
      setRoutinePM([]);
      setNeedsOnboarding(false);
      return;
    }

    async function loadUserProfile() {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setSkinType(data.skinType || "");
          setSkinConcerns(data.skinConcerns || "");
          setPreferences(data.preferences || "");
          setAge(data.age || "");
          setRoutineAM(data.routineAM || []);
          setRoutinePM(data.routinePM || []);
          
          // User needs onboarding if they haven't set their skin type
          if (!data.skinType) {
            setNeedsOnboarding(true);
          }
        } else {
          setNeedsOnboarding(true);
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
      }
    }

    loadUserProfile();
  }, [user]);

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
        body: JSON.stringify({
          message: trimmed,
          session_id: requestSessionId,
          skin_type: skinType || null,
          concerns: skinConcerns || null,
          preferences: preferences || null,
        }),
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

  async function handleAddProductToRoutine(messageContent, timeOfDay) {
    if (!user) return;
    
    // Simple heuristic to extract product names from chatbot text (usually bolded **Product Name** or list items)
    const productNames = [];
    const boldMatches = messageContent.match(/\*\*(.*?)\*\*/g);
    if (boldMatches) {
      boldMatches.forEach(m => {
        const cleaned = m.replace(/\*\*/g, "").trim();
        if (cleaned && cleaned.length > 2 && cleaned.length < 50 && !cleaned.includes(":") && !cleaned.includes("AM") && !cleaned.includes("PM")) {
          productNames.push(cleaned);
        }
      });
    }
    
    // Fallback if no bold text: use first line or split by dashes
    const fallbackName = messageContent.split("\n")[0].replace(/[*\-#]/g, "").trim().slice(0, 40);
    const finalName = productNames[0] || fallbackName || "Skincare Product";
    
    try {
      const userDocRef = doc(db, "users", user.uid);
      const isAM = timeOfDay === "AM";
      const targetRoutine = isAM ? [...routineAM] : [...routinePM];
      
      // Avoid duplicate adds
      if (targetRoutine.some(item => item.name === finalName)) {
        alert(`${finalName} is already in your ${timeOfDay} routine!`);
        return;
      }
      
      const newProduct = {
        id: crypto.randomUUID(),
        name: finalName,
        completed: false
      };
      
      const updated = [...targetRoutine, newProduct];
      if (isAM) {
        setRoutineAM(updated);
        await updateDoc(userDocRef, { routineAM: updated });
      } else {
        setRoutinePM(updated);
        await updateDoc(userDocRef, { routinePM: updated });
      }
      alert(`Added ${finalName} to your ${timeOfDay} routine!`);
    } catch (err) {
      console.error("Error adding product to routine:", err);
    }
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

  async function handleOnboardingSubmit(e) {
    e.preventDefault();
    if (!skinType) return;
    setOnboardingSaving(true);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        skinType,
        skinConcerns,
        preferences,
        age: age || "",
      }, { merge: true });
      setNeedsOnboarding(false);
    } catch (err) {
      console.error("Error saving onboarding details:", err);
    } finally {
      setOnboardingSaving(false);
    }
  }

  if (needsOnboarding) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-bg" aria-hidden="true">
          <div className="auth-blob auth-blob-1" />
          <div className="auth-blob auth-blob-2" />
        </div>
        <div className="auth-card onboarding-card">
          <div className="auth-hero onboarding-hero" aria-hidden="true">
            <div className="auth-hero-glow" />
            <div className="auth-hero-content">
              <div className="auth-hero-mark"><Sparkles size={32} /></div>
              <h2 className="auth-hero-title">Customise Your<br />Skincare Journey</h2>
              <p className="auth-hero-sub">We tailor recommendations using active ingredients suited exactly for your profile.</p>
            </div>
          </div>
          <div className="auth-form-panel">
            <form className="auth-form onboarding-form" onSubmit={handleOnboardingSubmit}>
              <div className="auth-form-heading">
                <h1>Skin Profile</h1>
                <p>Help us customize your recommendations.</p>
              </div>

              <div className="field">
                <label className="field-label">What is your skin type? *</label>
                <div className="skin-select-grid">
                  {["Dry", "Oily", "Combination", "Sensitive", "Normal"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`skin-chip-btn ${skinType === type ? "active" : ""}`}
                      onClick={() => setSkinType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="onboard-age" className="field-label">How old are you?</label>
                <div className="field-control">
                  <UserRound size={16} className="field-icon" />
                  <input
                    id="onboard-age"
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Enter your age"
                    min="1"
                    max="120"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="onboard-concerns" className="field-label">Any skin concerns or diseases? (e.g. Acne, Eczema, Rosacea)</label>
                <div className="field-control">
                  <Sparkles size={16} className="field-icon" />
                  <input
                    id="onboard-concerns"
                    value={skinConcerns}
                    onChange={(e) => setSkinConcerns(e.target.value)}
                    placeholder="Acne, Eczema, Rosacea, Psoriasis..."
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="onboard-prefs" className="field-label">Preferences (e.g. Cruelty-free, Fragrance-free)</label>
                <div className="field-control">
                  <Lock size={16} className="field-icon" />
                  <input
                    id="onboard-prefs"
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    placeholder="Cruelty-free, vegan, budget caps..."
                  />
                </div>
              </div>

              <button type="submit" className="auth-submit" disabled={!skinType || onboardingSaving}>
                {onboardingSaving ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                <span>{onboardingSaving ? "Saving profile..." : "Get Started"}</span>
              </button>
            </form>
          </div>
        </div>
      </main>
    );
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

          <div className="history-footer flex-column">
            <div className="tab-nav-buttons">
              <button
                type="button"
                className={`tab-nav-btn ${activeTab === "chat" ? "active" : ""}`}
                onClick={() => setActiveTab("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={`tab-nav-btn ${activeTab === "routine" ? "active" : ""}`}
                onClick={() => setActiveTab("routine")}
              >
                Routine
              </button>
              <button
                type="button"
                className={`tab-nav-btn ${activeTab === "analyzer" ? "active" : ""}`}
                onClick={() => setActiveTab("analyzer")}
              >
                Analyzer
              </button>
            </div>
            <button type="button" className="footer-link" onClick={() => setShowPrivacy(true)}>
              Privacy Policy
            </button>
          </div>
        </aside>

        {activeTab === "chat" && (
          <section className="chat-workspace" aria-label="Skincare assistant chat">
            <header className="topbar">
              <div className="brand-lockup">
                <div className="brand-mark" aria-hidden="true">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h1>Skincare Assistant</h1>
                  <p>{statusText} · {skinType || "No Profile"} · {user.email}</p>
                </div>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setDarkTheme(!darkTheme)}
                  title="Toggle Light/Dark Theme"
                >
                  <Sparkles size={18} />
                </button>
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
        )}

        {activeTab === "routine" && (
          <RoutineTrackerPanel
            user={user}
            routineAM={routineAM}
            routinePM={routinePM}
            setRoutineAM={setRoutineAM}
            setRoutinePM={setRoutinePM}
            setDarkTheme={setDarkTheme}
            darkTheme={darkTheme}
            handleSignOut={handleSignOut}
            skinType={skinType}
            skinConcerns={skinConcerns}
            age={age}
          />
        )}

        {activeTab === "analyzer" && (
          <IngredientAnalyzerPanel
            setDarkTheme={setDarkTheme}
            darkTheme={darkTheme}
            handleSignOut={handleSignOut}
          />
        )}
      </div>

      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
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
  const [googleLoading, setGoogleLoading] = useState(false);
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
    setGoogleLoading(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      await saveUserLogin(credential.user, {
        displayName: credential.user.displayName || "",
      });
    } catch (err) {
      if (err.code === "auth/account-exists-with-different-credential") {
        setAuthError("This email is already registered with a password. Please sign in using your email and password.");
      } else {
        setAuthError(authErrorMessage(err));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  const anySubmitting = isSubmitting || googleLoading;

  return (
    <main className="auth-shell" aria-label="Account access">
      {/* Decorative animated background blobs */}
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
      </div>

      <div className="auth-card">
        {/* Left decorative panel */}
        <div className="auth-hero" aria-hidden="true">
          <div className="auth-hero-glow" />
          <div className="auth-hero-content">
            <div className="auth-hero-mark">
              <Sparkles size={32} />
            </div>
            <h2 className="auth-hero-title">Your skin,<br />expertly guided.</h2>
            <p className="auth-hero-sub">AI-powered skincare recommendations tailored to your unique needs and budget.</p>
            <ul className="auth-feature-list">
              <li><span className="auth-feature-dot" />Personalised product picks</li>
              <li><span className="auth-feature-dot" />Budget-aware suggestions</li>
              <li><span className="auth-feature-dot" />Follow-up context memory</li>
            </ul>
          </div>
        </div>

        {/* Right form panel */}
        <div className="auth-form-panel">
          <div className="auth-form-inner">
            <div className="auth-mobile-brand">
              <div className="brand-mark" aria-hidden="true"><Sparkles size={18} /></div>
              <span>Skincare Assistant</span>
            </div>

            <div className="auth-form-heading">
              <h1>{isSignup ? "Create account" : "Welcome back"}</h1>
              <p>{isSignup ? "Join thousands discovering better skincare." : "Sign in to continue your chats."}</p>
            </div>

            {/* Google sign-in — prominent at top */}
            <button
              id="google-signin-btn"
              className="google-auth-button"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={anySubmitting}
              aria-busy={googleLoading}
            >
              {googleLoading
                ? <Loader2 size={18} className="spin" />
                : <GoogleMark />}
              <span>{googleLoading ? "Redirecting…" : "Continue with Google"}</span>
            </button>

            <div className="auth-divider"><span>or continue with email</span></div>

            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                id="tab-login"
                type="button"
                role="tab"
                aria-selected={!isSignup}
                className={!isSignup ? "active" : ""}
                onClick={() => { setMode("login"); setAuthError(""); }}
              >
                <LogIn size={15} />
                <span>Login</span>
              </button>
              <button
                id="tab-signup"
                type="button"
                role="tab"
                aria-selected={isSignup}
                className={isSignup ? "active" : ""}
                onClick={() => { setMode("signup"); setAuthError(""); }}
              >
                <UserPlus size={15} />
                <span>Sign up</span>
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit} noValidate>
              <div className={`auth-fields-wrapper ${isSignup ? "signup-mode" : ""}`}>
                {isSignup && (
                  <div className="field">
                    <label htmlFor="auth-name" className="field-label">Full name</label>
                    <div className="field-control">
                      <UserRound size={16} className="field-icon" />
                      <input
                        id="auth-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </div>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="auth-email" className="field-label">Email address</label>
                  <div className="field-control">
                    <Mail size={16} className="field-icon" />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <div className="field-label-row">
                    <label htmlFor="auth-password" className="field-label">Password</label>
                    {!isSignup && (
                      <span className="field-hint">6+ characters</span>
                    )}
                  </div>
                  <div className="field-control">
                    <Lock size={16} className="field-icon" />
                    <input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignup ? "Create a password" : "Your password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              </div>

              {authError && (
                <div className="error-bar auth-error" role="alert">
                  {authError}
                </div>
              )}

              <button
                id="auth-submit-btn"
                className="auth-submit"
                type="submit"
                disabled={anySubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting
                  ? <Loader2 size={18} className="spin" />
                  : isSignup ? <UserPlus size={18} /> : <LogIn size={18} />}
                <span>
                  {isSubmitting ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
                </span>
              </button>
            </form>

            <p className="auth-switch">
              {isSignup ? "Already have an account? " : "Don\'t have an account? "}
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => { setMode(isSignup ? "login" : "signup"); setAuthError(""); }}
              >
                {isSignup ? "Sign in" : "Sign up free"}
              </button>
            </p>

            <div className="auth-footer-links">
              <button type="button" className="footer-link" onClick={() => window.showPrivacyPolicy()}>
                Privacy Policy
              </button>
            </div>
          </div>
        </div>
      </div>
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

function RoutineTrackerPanel({
  user,
  routineAM,
  routinePM,
  setRoutineAM,
  setRoutinePM,
  setDarkTheme,
  darkTheme,
  handleSignOut,
  skinType,
  skinConcerns,
  age,
}) {
  const [newItemName, setNewItemName] = useState("");
  const [activeTime, setActiveTime] = useState("AM");

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItemName.trim() || !user) return;
    try {
      const userDocRef = doc(db, "users", user.uid);
      const isAM = activeTime === "AM";
      const currentList = isAM ? routineAM : routinePM;
      const updatedList = [...currentList, { id: crypto.randomUUID(), name: newItemName.trim(), completed: false }];
      if (isAM) {
        setRoutineAM(updatedList);
        await updateDoc(userDocRef, { routineAM: updatedList });
      } else {
        setRoutinePM(updatedList);
        await updateDoc(userDocRef, { routinePM: updatedList });
      }
      setNewItemName("");
    } catch (err) {
      console.error("Error adding item:", err);
    }
  }

  async function handleToggleItem(id, timeOfDay) {
    if (!user) return;
    try {
      const userDocRef = doc(db, "users", user.uid);
      const isAM = timeOfDay === "AM";
      const currentList = isAM ? routineAM : routinePM;
      const updatedList = currentList.map(item => item.id === id ? { ...item, completed: !item.completed } : item);
      if (isAM) {
        setRoutineAM(updatedList);
        await updateDoc(userDocRef, { routineAM: updatedList });
      } else {
        setRoutinePM(updatedList);
        await updateDoc(userDocRef, { routinePM: updatedList });
      }
    } catch (err) {
      console.error("Error toggling item:", err);
    }
  }

  async function handleDeleteItem(id, timeOfDay) {
    if (!user) return;
    try {
      const userDocRef = doc(db, "users", user.uid);
      const isAM = timeOfDay === "AM";
      const currentList = isAM ? routineAM : routinePM;
      const updatedList = currentList.filter(item => item.id !== id);
      if (isAM) {
        setRoutineAM(updatedList);
        await updateDoc(userDocRef, { routineAM: updatedList });
      } else {
        setRoutinePM(updatedList);
        await updateDoc(userDocRef, { routinePM: updatedList });
      }
    } catch (err) {
      console.error("Error deleting item:", err);
    }
  }

  const activeList = activeTime === "AM" ? routineAM : routinePM;

  return (
    <section className="chat-workspace" aria-label="Skincare routines">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={20} /></div>
          <div>
            <h1>Daily Routines</h1>
            <p>Track your AM & PM product routines</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => setDarkTheme(!darkTheme)} title="Theme">
            <Sparkles size={18} />
          </button>
          <button className="icon-button" type="button" onClick={handleSignOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="routine-nav-tabs">
        <button
          type="button"
          className={`routine-nav-btn ${activeTime === "AM" ? "active" : ""}`}
          onClick={() => setActiveTime("AM")}
        >
          ☀️ AM Routine
        </button>
        <button
          type="button"
          className={`routine-nav-btn ${activeTime === "PM" ? "active" : ""}`}
          onClick={() => setActiveTime("PM")}
        >
          🌙 PM Routine
        </button>
      </div>

      <div className="routine-body-container">
        <form className="routine-add-form" onSubmit={handleAddItem}>
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add new routine product..."
            required
          />
          <button type="submit" className="routine-add-btn">Add</button>
        </form>

        <div className="routine-items-list">
          {activeList.length === 0 ? (
            <p className="empty-routine-text">No products in this routine yet. Add them above or check out our suggested routine below.</p>
          ) : (
            activeList.map(item => (
              <div key={item.id} className={`routine-item-row ${item.completed ? "completed" : ""}`}>
                <label className="routine-checkbox-label">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggleItem(item.id, activeTime)}
                  />
                  <span className="routine-item-name">{item.name}</span>
                </label>
                <button
                  type="button"
                  className="routine-delete-btn"
                  onClick={() => handleDeleteItem(item.id, activeTime)}
                  title="Remove product"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        <RoutineSuggestorSection
          user={user}
          routineAM={routineAM}
          routinePM={routinePM}
          setRoutineAM={setRoutineAM}
          setRoutinePM={setRoutinePM}
          skinType={skinType}
          skinConcerns={skinConcerns}
          age={age}
        />
      </div>
    </section>
  );
}

function IngredientAnalyzerPanel({ setDarkTheme, darkTheme, handleSignOut }) {
  const [ingredientsText, setIngredientsText] = useState("");
  const [analysisResults, setAnalysisResults] = useState(null);
  const [dbConflicts, setDbConflicts] = useState([]);
  const [unsafeList, setUnsafeList] = useState([]);

  // Predefined conflict dictionary for standard skincare actives
  const ACTIVES_DICTS = [
    { name: "Retinol / Retinoids", patterns: [/retinol/i, /retinoid/i, /tretinoin/i, /adapalene/i] },
    { name: "Vitamin C (L-Ascorbic Acid)", patterns: [/ascorbic/i, /vitamin c/i] },
    { name: "AHAs (Glycolic/Lactic Acid)", patterns: [/glycolic/i, /lactic/i, /alpha hydroxy/i, /aha/i, /glycolic acid/i] },
    { name: "BHAs (Salicylic Acid)", patterns: [/salicylic/i, /bha/i, /beta hydroxy/i, /salicylic acid/i] },
    { name: "Niacinamide", patterns: [/niacinamide/i, /vitamin b3/i] },
    { name: "Benzoyl Peroxide", patterns: [/benzoyl peroxide/i, /benzoyl/i] }
  ];

  useEffect(() => {
    async function loadData() {
      try {
        const [conflictRes, unsafeRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/conflicts`),
          fetch(`${API_BASE_URL}/api/unsafe-ingredients`)
        ]);
        if (conflictRes.ok) {
          const cData = await conflictRes.json();
          setDbConflicts(cData.conflicts || []);
        }
        if (unsafeRes.ok) {
          const uData = await unsafeRes.json();
          setUnsafeList(uData.unsafe_ingredients || []);
        }
      } catch (err) {
        console.error("Failed to load safety data:", err);
      }
    }
    loadData();
  }, []);

  function handleAnalyze() {
    if (!ingredientsText.trim()) return;

    const detected = [];
    ACTIVES_DICTS.forEach(active => {
      if (active.patterns.some(regex => regex.test(ingredientsText))) {
        detected.push(active.name);
      }
    });

    // Match unsafe/banned ingredients
    const matchedUnsafe = [];
    unsafeList.forEach(item => {
      const isMatched = item.patterns.some(pat => {
        const regex = new RegExp(pat, "i");
        return regex.test(ingredientsText);
      });
      if (isMatched) {
        matchedUnsafe.push(item);
      }
    });

    const activeConflicts = [];
    const sourceConflicts = dbConflicts.length > 0 ? dbConflicts : [
      {
        actives: ["Retinol / Retinoids", "AHAs (Glycolic/Lactic Acid)"],
        severity: "High Danger",
        reason: "Both exfoliate the skin at different levels. Mixing them causes extreme dryness, skin barrier peeling, irritation, and redness. Use them on alternate nights instead."
      },
      {
        actives: ["Retinol / Retinoids", "BHAs (Salicylic Acid)"],
        severity: "High Danger",
        reason: "Retinol speeds up skin cell turnover while BHA penetrates deep to exfoliate pores. Combining them compromises the skin barrier. Space them out across different days."
      },
      {
        actives: ["Vitamin C (L-Ascorbic Acid)", "AHAs (Glycolic/Lactic Acid)"],
        severity: "Moderate Danger",
        reason: "Both are highly acidic ingredients. Layering them can destabilize the pH balance, render both less effective, and trigger stinging or irritation."
      },
      {
        actives: ["Retinol / Retinoids", "Vitamin C (L-Ascorbic Acid)"],
        severity: "Moderate Danger",
        reason: "Retinol functions best at a neutral pH (5.5 - 6.0), while Vitamin C requires an acidic pH (3.5 or lower). Apply Vitamin C in the AM and Retinol in the PM."
      }
    ];

    for (let i = 0; i < detected.length; i++) {
      for (let j = i + 1; j < detected.length; j++) {
        const itemA = detected[i];
        const itemB = detected[j];
        const match = sourceConflicts.find(conflict => 
          conflict.actives.some(act => itemA.toLowerCase().includes(act.toLowerCase().split(" (")[0].split(" /")[0])) &&
          conflict.actives.some(act => itemB.toLowerCase().includes(act.toLowerCase().split(" (")[0].split(" /")[0]))
        );
        if (match) {
          activeConflicts.push(match);
        }
      }
    }

    setAnalysisResults({
      detectedList: detected,
      conflictsList: activeConflicts,
      unsafeMatches: matchedUnsafe
    });
  }

  return (
    <section className="chat-workspace" aria-label="Ingredient analyzer">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={20} /></div>
          <div>
            <h1>Ingredient Safety Analyzer</h1>
            <p>Paste ingredient lists to check active ingredient conflicts and banned substances</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => setDarkTheme(!darkTheme)} title="Theme">
            <Sparkles size={18} />
          </button>
          <button className="icon-button" type="button" onClick={handleSignOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="analyzer-body-container">
        <div className="analyzer-card-layout">
          <div className="analyzer-input-box">
            <label htmlFor="raw-ingredients" className="field-label">Ingredients list</label>
            <textarea
              id="raw-ingredients"
              rows={6}
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder="Paste active ingredients or product contents list here (e.g. Aqua, Retinol, DMDM Hydantoin, Triclosan...)"
            />
            <button type="button" className="auth-submit" onClick={handleAnalyze}>
              Analyze Actives & Safety
            </button>
          </div>

          {analysisResults && (
            <div className="analyzer-output-results">
              <h3>Analysis Output</h3>
              
              <div className="detected-actives-row">
                <strong>Detected Actives:</strong>
                {analysisResults.detectedList.length === 0 ? (
                  <span className="no-actives-text">No active chemical ingredients detected.</span>
                ) : (
                  analysisResults.detectedList.map(item => (
                    <span key={item} className="active-item-badge">{item}</span>
                  ))
                )}
              </div>

              {/* TOXIC BANNED INGREDIENTS LIST WARNING */}
              {analysisResults.unsafeMatches && analysisResults.unsafeMatches.length > 0 && (
                <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                  <strong style={{ color: "#d9534f", fontSize: "13px", display: "block", marginBottom: "8px" }}>⚠️ Banned / Toxic Substances Detected:</strong>
                  {analysisResults.unsafeMatches.map((item, idx) => (
                    <div key={idx} className="conflict-banner-row high-danger" style={{ marginBottom: "8px" }}>
                      <div className="conflict-badge">Toxic Warning</div>
                      <div className="conflict-actives-involved"><strong>{item.name}</strong></div>
                      <p className="conflict-reason-text">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="conflicts-output-list">
                {analysisResults.conflictsList.length === 0 ? (
                  <div className="success-banner">
                    🎉 Safe Routine! No hazardous conflicts detected among active ingredients in this combination.
                  </div>
                ) : (
                  analysisResults.conflictsList.map((conflict, idx) => (
                    <div key={idx} className={`conflict-banner-row ${conflict.severity.replace(" ", "-").toLowerCase()}`}>
                      <div className="conflict-badge">{conflict.severity}</div>
                      <div className="conflict-actives-involved">
                        <strong>{conflict.actives.join(" + ")}</strong>
                      </div>
                      <p className="conflict-reason-text">{conflict.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RoutineSuggestorSection({ user, routineAM, routinePM, setRoutineAM, setRoutinePM, skinType, skinConcerns, age }) {
  const [dynamicRoutine, setDynamicRoutine] = useState(null);
  const [activeConflicts, setActiveConflicts] = useState([]);
  const [suggestedActives, setSuggestedActives] = useState([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [dbConflicts, setDbConflicts] = useState([]);

  useEffect(() => {
    async function loadConflicts() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/conflicts`);
        if (res.ok) {
          const data = await res.json();
          setDbConflicts(data.conflicts || []);
        }
      } catch (err) {
        console.error("Failed to load conflicts in suggestor:", err);
      }
    }
    loadConflicts();
  }, []);

  // Map user age number to the category groups in the database
  const getAgeGroup = (ageVal) => {
    const numericAge = parseInt(ageVal, 10);
    if (isNaN(numericAge)) return "20-35";
    if (numericAge < 20) return "Under 20";
    if (numericAge <= 35) return "20-35";
    if (numericAge <= 50) return "36-50";
    return "50+";
  };

  async function handleGenerate() {
    const ageGroup = getAgeGroup(age);
    const resolvedType = skinType || "Normal";
    const resolvedConcern = skinConcerns || "None";

    try {
      const response = await fetch(`${API_BASE_URL}/api/suggest-routine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skin_type: resolvedType,
          concern: resolvedConcern,
          age_group: ageGroup,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to query the skincare treatment database.");
      }

      const data = await response.json();
      const dbSuggestions = data.suggestions || [];

      // Extract unique ingredients from database suggestions
      const actives = [];
      dbSuggestions.forEach((sug) => {
        const parts = sug.ingredients.split(/[+,]/);
        parts.forEach((p) => {
          const cleaned = p.trim();
          if (cleaned) {
            actives.push(cleaned);
          }
        });
      });

      const uniqueActives = [...new Set(actives)];
      setSuggestedActives(uniqueActives);

      // Perform safety check on suggested actives
      const conflicts = [];
      const sourceConflicts = dbConflicts.length > 0 ? dbConflicts : [
        {
          actives: ["Retinol / Retinoids", "Salicylic Acid (BHA)"],
          severity: "High Danger",
          reason: "Combining Retinol and Salicylic Acid simultaneously causes extreme peeling, skin irritation, and barrier damage. Use them on alternate days."
        },
        {
          actives: ["Retinol / Retinoids", "Vitamin C (L-Ascorbic Acid)"],
          severity: "Moderate Danger",
          reason: "Retinol functions best at neutral pH, while Vitamin C requires acidic pH. Apply Vitamin C in the AM and Retinol in the PM."
        }
      ];

      for (let i = 0; i < uniqueActives.length; i++) {
        for (let j = i + 1; j < uniqueActives.length; j++) {
          const itemA = uniqueActives[i];
          const itemB = uniqueActives[j];
          const match = sourceConflicts.find((conflict) =>
            conflict.actives.some((act) => itemA.toLowerCase().includes(act.toLowerCase().split(" (")[0].split(" /")[0])) &&
            conflict.actives.some((act) => itemB.toLowerCase().includes(act.toLowerCase().split(" (")[0].split(" /")[0]))
          );
          if (match) {
            conflicts.push(match);
          }
        }
      }

      // Age limit validation (e.g. Under 20 shouldn't use Retinol)
      const hasRetinol = uniqueActives.some((a) => a.toLowerCase().includes("retinol") || a.toLowerCase().includes("retinoid"));
      if (ageGroup === "Under 20" && hasRetinol) {
        conflicts.push({
          actives: ["Retinol / Retinoids", "Under 20 Age Group"],
          severity: "Age Warning",
          reason: "Retinol cell-turnover acceleration is not recommended for skin under 20 unless prescribed. Swapped with gentle alternatives."
        });
      }

      // Filter out retinol for Under 20 safety
      const safeActives = ageGroup === "Under 20"
        ? uniqueActives.filter((a) => !a.toLowerCase().includes("retinol") && !a.toLowerCase().includes("retinoid"))
        : uniqueActives;

      setActiveConflicts(conflicts);

      // Generate structured routine steps from database actives
      const amSteps = [];
      const pmSteps = [];

      // AM Cleansing
      if (resolvedConcern.toLowerCase().includes("rosacea") || resolvedConcern.toLowerCase().includes("eczema") || resolvedType === "Sensitive") {
        amSteps.push({ name: "☀️ Soothing Non-foaming Cream Cleanser" });
      } else {
        amSteps.push({ name: "☀️ Gentle Daily Gel Wash" });
      }

      // AM Treatment
      safeActives.forEach((active) => {
        const lower = active.toLowerCase();
        if (lower.includes("vitamin c")) {
          amSteps.push({ name: `☀️ Vitamin C Protective Serum (DB Match: ${active})` });
        } else if (lower.includes("hyaluronic")) {
          amSteps.push({ name: `☀️ Hyaluronic Acid Hydrating Serum (DB Match: ${active})` });
        } else if (lower.includes("zinc") || lower.includes("benzoyl")) {
          amSteps.push({ name: `☀️ Acne Clearing Fluid (DB Match: ${active})` });
        }
      });

      // AM Protection
      if (resolvedType === "Dry") {
        amSteps.push({ name: "☀️ Daily Nourishing Cream Moisturiser" });
      } else {
        amSteps.push({ name: "☀️ Lightweight Hydrating Lotion" });
      }
      amSteps.push({ name: "☀️ Broad-spectrum Protective Sunscreen (SPF 50+)" });

      // PM Cleansing
      pmSteps.push({ name: "🌙 Gentle Cleanser / Micellar Wash" });

      // PM Treatment
      safeActives.forEach((active) => {
        const lower = active.toLowerCase();
        if (lower.includes("retinol") || lower.includes("retinoid")) {
          pmSteps.push({ name: `🌙 Retinol Night Support Serum (DB Match: ${active})` });
        } else if (lower.includes("salicylic") || lower.includes("bha")) {
          pmSteps.push({ name: `🌙 BHA Exfoliating treatment (DB Match: ${active})` });
        } else if (lower.includes("niacinamide")) {
          pmSteps.push({ name: `🌙 Niacinamide Barrier Serum (DB Match: ${active})` });
        } else if (lower.includes("cica") || lower.includes("centella") || lower.includes("azelaic")) {
          pmSteps.push({ name: `🌙 Soothing Skin Treatment (DB Match: ${active})` });
        }
      });

      // PM Nourish
      const hasCeramides = safeActives.some((a) => a.toLowerCase().includes("ceramide"));
      if (hasCeramides || resolvedType === "Dry") {
        pmSteps.push({ name: "🌙 Intensive Ceramide Night Recovery Cream" });
      } else {
        pmSteps.push({ name: "🌙 Soothing Night Moisturiser" });
      }

      setDynamicRoutine({ AM: amSteps, PM: pmSteps });
      setHasGenerated(true);
    } catch (err) {
      console.error("Error generating routine from database:", err);
      alert("Error querying database: " + err.message);
    }
  }

  async function applyCustomRoutine() {
    if (!user || !dynamicRoutine) return;
    try {
      const userDocRef = doc(db, "users", user.uid);
      const newAM = dynamicRoutine.AM.map(item => ({
        id: crypto.randomUUID(),
        name: item.name,
        completed: false
      }));
      const newPM = dynamicRoutine.PM.map(item => ({
        id: crypto.randomUUID(),
        name: item.name,
        completed: false
      }));

      setRoutineAM(newAM);
      setRoutinePM(newPM);
      await updateDoc(userDocRef, {
        routineAM: newAM,
        routinePM: newPM
      });
      alert("Successfully loaded custom generated routine steps!");
    } catch (err) {
      console.error("Error saving routine:", err);
    }
  }

  return (
    <div className="routine-suggestor-card">
      <h4 style={{ marginBottom: "6px" }}>Skin Profile Routine Suggestor</h4>
      <p style={{ fontSize: "12px", color: "#666", marginBottom: "14px" }}>
        Generating suggestions using your profile: <strong>{skinType || "Normal"} Skin</strong>
        {skinConcerns ? `, concern: <strong>${skinConcerns}</strong>` : ""}
        {age ? `, age: <strong>${age}</strong>` : ""}.
      </p>

      <button type="button" className="auth-submit" style={{ minHeight: "36px", marginBottom: "16px" }} onClick={handleGenerate}>
        Generate Suggested Routine from Profile
      </button>

      {/* 2. SUGGESTED INGREDIENTS */}
      {hasGenerated && (
        <div className="suggested-actives-bar" style={{ marginBottom: "16px" }}>
          <strong>Suggested Ingredients for Profile:</strong>
          <div className="actives-list-wrapper" style={{ marginTop: "6px" }}>
            {suggestedActives.map(active => (
              <span key={active} className="active-item-badge">{active}</span>
            ))}
          </div>
        </div>
      )}

      {/* 3. CONFLICT CHECK RESULTS */}
      {hasGenerated && activeConflicts.length > 0 && (
        <div className="conflicts-output-list" style={{ marginBottom: "16px" }}>
          {activeConflicts.map((conflict, idx) => (
            <div key={idx} className={`conflict-banner-row ${conflict.severity.replace(" ", "-").toLowerCase()}`}>
              <div className="conflict-badge">{conflict.severity}</div>
              <div className="conflict-actives-involved">
                <strong>{conflict.actives.join(" + ")}</strong>
              </div>
              <p className="conflict-reason-text">{conflict.reason}</p>
            </div>
          ))}
        </div>
      )}

      {/* 4. GENERATED AM/PM STEPS */}
      {hasGenerated && dynamicRoutine && (
        <div className="suggested-splits-container" style={{ borderTop: "1px solid #edf4f0", paddingTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gridColumn: "1 / -1", alignItems: "center", marginBottom: "10px" }}>
            <h5 style={{ margin: 0, fontSize: "13px" }}>Custom Recommended Steps</h5>
            <button type="button" className="apply-routine-btn" style={{ padding: "6px 12px", fontSize: "11px" }} onClick={applyCustomRoutine}>
              Load Routine Steps
            </button>
          </div>
          <div className="suggested-split-col">
            <h5>☀️ AM Steps</h5>
            <ul>
              {dynamicRoutine.AM.map((item, idx) => (
                <li key={idx}>{item.name}</li>
              ))}
            </ul>
          </div>
          <div className="suggested-split-col">
            <h5>🌙 PM Steps</h5>
            <ul>
              {dynamicRoutine.PM.map((item, idx) => (
                <li key={idx}>{item.name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
