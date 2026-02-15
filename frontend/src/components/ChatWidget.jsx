import { useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bot, Loader2, Send, User, X } from "lucide-react";
import { chatWithAssistant } from "../services/api";

const STARTER_PROMPTS = [
  "How many datasets are uploaded?",
  "How do I clean my selected dataset?",
  "Show visualization summary",
];

export default function ChatWidget() {
  const location = useLocation();
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [datasetId, setDatasetId] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi, I can help with upload, cleaning, visualizations, and reports.",
      suggestions: STARTER_PROMPTS,
    },
  ]);

  const currentPage = useMemo(() => {
    if (location.pathname === "/") return "dashboard";
    return location.pathname.replace("/", "") || "app";
  }, [location.pathname]);

  const pushMessage = (role, messageText, suggestions = []) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random()}`,
        role,
        text: messageText,
        suggestions,
      },
    ]);
  };

  const sendMessage = async (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed || isSending) return;

    pushMessage("user", trimmed);
    setText("");
    setIsSending(true);

    try {
      const response = await chatWithAssistant({
        message: trimmed,
        page: currentPage,
        dataset_id: datasetId ? Number(datasetId) : null,
      });
      pushMessage("assistant", response.reply, response.suggestions || []);
    } catch (error) {
      pushMessage("assistant", error.message || "Chat request failed. Please try again.");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {isOpen ? (
        <div className="w-[22rem] rounded-xl border border-green-300 bg-white font-semibold shadow-theme md:w-[25rem] dark:border-green-700 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-green-100 bg-gradient-to-r from-white to-green-50 px-4 py-3 dark:border-green-800 dark:from-slate-950 dark:to-green-950/30">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Assistant</p>
              <p className="text-xs text-green-700 dark:text-green-300">Page: {currentPage}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-slate-500 hover:bg-green-100 dark:text-slate-300 dark:hover:bg-green-900/30"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-green-200 bg-gradient-to-r from-white to-green-100 px-4 py-2 dark:border-green-900/50 dark:bg-green-950/20">
            <label className="text-xs text-green-800 dark:text-green-300">Dataset Id (optional)</label>
            <input
              type="number"
              min="1"
              value={datasetId}
              onChange={(event) => setDatasetId(event.target.value)}
              placeholder="ex: 3"
              className="mt-1 w-full rounded-md border border-green-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-green-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="max-h-80 space-y-3 overflow-y-auto bg-gradient-to-b from-white to-green-50 px-4 py-3 dark:from-slate-950 dark:to-green-950/20">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
                <div
                    className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm font-semibold ${
                    message.role === "user"
                      ? "bg-teal-600 text-white"
                      : "bg-theme-secondary text-theme-primary"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1 text-[11px] opacity-80">
                    {message.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    <span>{message.role === "user" ? "You" : "Assistant"}</span>
                  </div>
                  <p>{message.text}</p>
                </div>
                {message.role === "assistant" && message.suggestions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.suggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={`${message.id}_${suggestion}`}
                        type="button"
                        onClick={() => sendMessage(suggestion)}
                        className="rounded-full border border-green-300 bg-white px-2.5 py-1 text-xs font-semibold text-green-900 hover:border-green-500 dark:border-green-700 dark:bg-slate-900 dark:text-green-300"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-green-200 bg-gradient-to-r from-white to-green-100 px-4 py-3 dark:border-green-900/50 dark:bg-slate-950">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendMessage(text);
                }
              }}
              placeholder="Ask assistant..."
              className="flex-1 rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-green-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => sendMessage(text)}
              disabled={isSending}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-500"
              aria-label="Send"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-400 bg-gradient-to-br from-white to-green-200 text-green-800 shadow-theme hover:from-green-50 hover:to-green-300 dark:border-green-700 dark:from-slate-900 dark:to-green-900/40 dark:text-green-300"
          aria-label="Open chat"
        >
          <Bot className="h-7 w-7" />
        </button>
      )}
    </div>
  );
}
