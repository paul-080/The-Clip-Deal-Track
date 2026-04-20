import { useState, useEffect, useRef, useCallback } from "react";
import { Send, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API } from "../App";

export default function SupportPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const fetchMessages = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`${API}/support/messages`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      if (!silent) toast.error("Impossible de charger les messages");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    // Poll for new admin replies every 10s
    pollRef.current = setInterval(() => fetchMessages(true), 10000);
    return () => clearInterval(pollRef.current);
  }, [fetchMessages]);

  useEffect(() => {
    if (loading) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const content = newMessage.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/support/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Erreur");
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setNewMessage("");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-h-[760px] bg-[#121212] border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00E5FF]/15 flex items-center justify-center">
            <MessageCircle className="w-4.5 h-4.5 text-[#00E5FF]" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Support The Clip Deal</p>
            <p className="text-white/40 text-xs">Réponse habituelle sous 24h</p>
          </div>
        </div>
        <button
          onClick={() => fetchMessages()}
          className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-colors"
          title="Actualiser"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Welcome bubble — always visible */}
            <div className="flex justify-start">
              <div className="max-w-[78%] bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-[11px] font-semibold text-[#00E5FF] mb-1">Support ✦</p>
                <p className="text-white/80 text-sm leading-relaxed">
                  Bonjour, comment puis-je vous aider ?
                </p>
              </div>
            </div>

            {messages.map((msg) => (
              <div
                key={msg.message_id}
                className={`flex ${msg.from_admin ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.from_admin
                      ? "bg-white/8 border border-white/10 rounded-bl-sm"
                      : "bg-[#00E5FF] text-black rounded-br-sm"
                  }`}
                >
                  {msg.from_admin && (
                    <p className="text-[11px] font-semibold text-[#00E5FF] mb-1">Support ✦</p>
                  )}
                  <p className={msg.from_admin ? "text-white/80" : "text-black"}>{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1.5 ${
                      msg.from_admin ? "text-white/25" : "text-black/40"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/10 flex gap-2 flex-shrink-0">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écrivez votre message... (Entrée pour envoyer)"
          rows={1}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00E5FF]/40 resize-none leading-relaxed"
          style={{ minHeight: "42px", maxHeight: "120px" }}
          onInput={(e) => {
            e.target.style.height = "42px";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !newMessage.trim()}
          className="px-4 py-2.5 bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-xl transition-all flex-shrink-0 self-end"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
