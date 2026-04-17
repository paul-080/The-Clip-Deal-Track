import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import { motion } from "framer-motion";
import {
  Send, HelpCircle, Lightbulb, DollarSign, Eye, EyeOff,
  CheckCircle, CreditCard, ChevronLeft, User, AlertCircle,
  MessageSquare, ExternalLink
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

export default function ChatPanel({ campaigns }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [noRibError, setNoRibError] = useState(false);
  const [activeTab, setActiveTab] = useState("questions");
  const [messages, setMessages] = useState([]);
  const [clippers, setClippers] = useState([]);
  const [selectedClipper, setSelectedClipper] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [adviceContent, setAdviceContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [receivedAdvices, setReceivedAdvices] = useState([]);
  const [tabUnread, setTabUnread] = useState({ questions: 0, conseils: 0 });
  const [claimingPayment, setClaimingPayment] = useState(false);
  const [ibanVisible, setIbanVisible] = useState(false);
  const conseilsEndRef = useRef(null);
  const remunerationEndRef = useRef(null);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

  // ── Helpers localStorage pour "vu jusqu'à" par onglet ──────────────────
  const lsKey = (tab) => `chatSeen_${campaignId}_${tab}_${user?.user_id}`;
  const getLastSeen = (tab) => { try { return localStorage.getItem(lsKey(tab)) || ""; } catch { return ""; } };
  const saveLastSeen = (tab) => { try { localStorage.setItem(lsKey(tab), new Date().toISOString()); } catch {} };

  const pathParts = location.pathname.split("/");
  const campaignIndex = pathParts.indexOf("campaign");
  const campaignId = campaignIndex !== -1 ? pathParts[campaignIndex + 1] : null;
  const campaign = campaigns?.find((c) => c.campaign_id === campaignId);
  const isAgency = user?.role === "agency" || user?.role === "manager";
  const isAgencyOnly = user?.role === "agency";
  const isClipper = user?.role === "clipper";
  const accentColor = isAgency ? "#FF007F" : "#00E5FF";

  useEffect(() => {
    if (!campaignId) return;
    fetchMessages();
    fetchClippers();
    fetchPaymentSummary();
    fetchReceivedAdvices();
    connectWebSocket();
    markRead();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [campaignId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    remunerationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    conseilsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [receivedAdvices, messages]);

  // ── Calcul non-lus Questions ────────────────────────────────────────────
  useEffect(() => {
    if (!messages.length) return;
    const lastSeen = getLastSeen("questions");
    if (activeTab === "questions") {
      setTabUnread(prev => ({ ...prev, questions: 0 }));
      saveLastSeen("questions");
    } else {
      const count = messages.filter(m =>
        m.sender_id !== user?.user_id &&
        (!lastSeen || (m.created_at || "") > lastSeen)
      ).length;
      setTabUnread(prev => ({ ...prev, questions: count }));
    }
  }, [messages, activeTab]);

  // ── Calcul non-lus Conseils (côté clippeur) ─────────────────────────────
  useEffect(() => {
    if (!isClipper || !receivedAdvices.length) return;
    const lastSeen = getLastSeen("conseils");
    if (activeTab === "conseils") {
      setTabUnread(prev => ({ ...prev, conseils: 0 }));
      saveLastSeen("conseils");
    } else {
      const count = receivedAdvices.filter(a =>
        !lastSeen || (a.created_at || "") > lastSeen
      ).length;
      setTabUnread(prev => ({ ...prev, conseils: count }));
    }
  }, [receivedAdvices, activeTab]);

  // ── Quand on change d'onglet → marquer comme vu ─────────────────────────
  useEffect(() => {
    setSelectedClipper(null);
    saveLastSeen(activeTab);
    setTabUnread(prev => ({ ...prev, [activeTab]: 0 }));
  }, [activeTab]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/messages`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const fetchClippers = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/clippers-advice-status`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setClippers(data.clippers || []);
      }
    } catch {}
  };

  const fetchPaymentSummary = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/payment-summary`, { credentials: "include" });
      if (res.ok) setPaymentSummary(await res.json());
    } catch {}
  };

  const fetchReceivedAdvices = async () => {
    if (!isClipper) return;
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/received-advices`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReceivedAdvices(data.advices || []);
      }
    } catch {}
  };

  const markRead = async () => {
    try {
      await fetch(`${API}/campaigns/${campaignId}/mark-read`, {
        method: "POST", credentials: "include",
      });
    } catch {}
  };

  const connectWebSocket = () => {
    if (!user?.user_id) return;
    const wsUrl = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000")
      .replace("https://", "wss://").replace("http://", "ws://");
    try {
      wsRef.current = new WebSocket(`${wsUrl}/ws/${user.user_id}`);
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.message.campaign_id === campaignId) {
          setMessages((prev) => prev.find(m => m.message_id === data.message.message_id) ? prev : [...prev, data.message]);
          const msgType = data.message.message_type || "question";
          if (data.message.sender_id !== user?.user_id) {
            if (msgType === "question" || msgType === "chat" || !msgType) {
              setTabUnread(prev => ({
                ...prev,
                questions: activeTab === "questions" ? 0 : (prev.questions || 0) + 1,
              }));
              if (activeTab === "questions") saveLastSeen("questions");
            } else if (msgType === "conseil") {
              setTabUnread(prev => ({
                ...prev,
                conseils: activeTab === "conseils" ? 0 : (prev.conseils || 0) + 1,
              }));
              if (activeTab === "conseils") saveLastSeen("conseils");
            }
          }
        }
        if (data.type === "new_advice" && isClipper) {
          fetchReceivedAdvices();
          if (activeTab !== "conseils") {
            setTabUnread(prev => ({ ...prev, conseils: (prev.conseils || 0) + 1 }));
          } else {
            saveLastSeen("conseils");
          }
        }
      };
      wsRef.current.onclose = () => setTimeout(connectWebSocket, 3000);
    } catch {}
  };

  const getTabMessageType = () => {
    if (activeTab === "conseils") return "conseil";
    if (activeTab === "remuneration") return "remuneration";
    if (activeTab === "paiement") return "remuneration";
    return "question";
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !campaignId) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaign_id: campaignId, content: newMessage.trim(), message_type: getTabMessageType() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => prev.find(m => m.message_id === msg.message_id) ? prev : [...prev, msg]);
        setNewMessage("");
      }
    } catch {}
    finally { setSending(false); }
  };

  const handleSendAdvice = async () => {
    if (!adviceContent.trim() || !selectedClipper) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/advices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaign_id: campaignId, recipient_ids: [selectedClipper.user_id], content: adviceContent.trim() }),
      });
      if (res.ok) {
        toast.success(`Conseil envoyé à ${selectedClipper.display_name || selectedClipper.name}`);
        setAdviceContent("");
        fetchClippers();
      }
    } catch {}
    finally { setSending(false); }
  };

  const handleConfirmPayment = async () => {
    if (!selectedClipper) return;
    const clipperPayment = paymentSummary?.clippers?.find(c => c.user_id === selectedClipper.user_id);
    if (!clipperPayment || clipperPayment.owed <= 0) return;
    setConfirmingPayment(true);
    try {
      const res = await fetch(`${API}/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: selectedClipper.user_id, campaign_id: campaignId, amount: clipperPayment.owed }),
      });
      if (res.ok) {
        toast.success("Paiement confirmé ✓");
        const notifMsg = `✅ Virement de €${clipperPayment.owed.toFixed(2)} envoyé. Merci pour ton travail sur cette campagne !`;
        const notifRes = await fetch(`${API}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ campaign_id: campaignId, content: notifMsg, message_type: "remuneration" }),
        });
        if (notifRes.ok) {
          const newMsg = await notifRes.json();
          setMessages(prev => prev.find(m => m.message_id === newMsg.message_id) ? prev : [...prev, newMsg]);
        }
        fetchPaymentSummary();
      }
    } catch {}
    finally { setConfirmingPayment(false); }
  };

  const handleClaimPayment = async () => {
    if (!paymentSummary || paymentSummary.owed <= 0) return;
    if (!user?.payment_info?.trim()) {
      setNoRibError(true);
      return;
    }
    setNoRibError(false);
    setClaimingPayment(true);
    const msg = `💰 Je réclame mon paiement : €${paymentSummary.owed.toFixed(2)} pour ${fmt(paymentSummary.views)} vues sur cette campagne. Mon IBAN/PayPal : ${user.payment_info}`;
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaign_id: campaignId, content: msg, message_type: "remuneration" }),
      });
      if (res.ok) {
        const newMsg = await res.json();
        setMessages(prev => prev.find(m => m.message_id === newMsg.message_id) ? prev : [...prev, newMsg]);
        toast.success("Réclamation envoyée à l'agence ✓");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setClaimingPayment(false); }
  };

  const fmt = (n) => {
    if (!n) return "0";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e4) return Math.round(n / 1000) + "K";
    if (n >= 1e3) return (n / 1000).toFixed(1) + "K";
    return n.toLocaleString("fr-FR");
  };

  const getRoleColor = (role) => ({ clipper: "#00E5FF", agency: "#FF007F", manager: "#39FF14", client: "#FFB300" }[role] || "#fff");
  const formatTime = (h) => h < 24 ? `${Math.round(h)}h` : `${Math.floor(h / 24)}j`;

  const sidebarClippers = () => {
    if (activeTab === "paiement" && paymentSummary?.clippers) {
      return [...paymentSummary.clippers].sort((a, b) => b.earned - a.earned);
    }
    if (activeTab === "conseils") {
      return [...clippers].sort((a, b) => {
        const hoursA = a.hours_since_advice ?? Infinity;
        const hoursB = b.hours_since_advice ?? Infinity;
        return hoursB - hoursA;
      });
    }
    return clippers;
  };

  const questionMessages = messages.filter(m => !m.message_type || m.message_type === "question" || m.message_type === "chat");
  const conseilChatMessages = messages.filter(m => m.message_type === "conseil");
  const remunerationMessages = messages.filter(m => m.message_type === "remuneration");

  const visibleMessages = selectedClipper
    ? questionMessages.filter(m => m.sender_id === selectedClipper.user_id || m.sender_id === user?.user_id)
    : questionMessages;

  const visibleConseilMessages = selectedClipper
    ? conseilChatMessages.filter(m => m.sender_id === selectedClipper.user_id || m.sender_id === user?.user_id)
    : conseilChatMessages;

  if (!campaignId) {
    return (
      <div className="flex items-center justify-center h-64 bg-[#0d0d0d]">
        <div className="text-center">
          <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">Sélectionnez une campagne</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "questions", label: "Questions", icon: HelpCircle },
    { id: "conseils", label: "Conseils", icon: Lightbulb },
    ...(isAgencyOnly ? [{ id: "paiement", label: "Paiement", icon: DollarSign }] : []),
    ...(isClipper ? [{ id: "remuneration", label: "Rémunération", icon: DollarSign }] : []),
  ];

  // ── Shared sub-components ──────────────────────────────────────────────

  const MessageBubble = ({ msg }) => {
    const isOwn = msg.sender_id === user?.user_id;
    const roleColor = getRoleColor(msg.sender_role);
    const time = new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    return (
      <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn && (
          <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {msg.sender_picture
              ? <img src={msg.sender_picture} alt="" className="w-full h-full object-cover" />
              : <span className="text-[10px] font-bold text-white/60">
                  {(msg.sender_name || "?")[0].toUpperCase()}
                </span>
            }
          </div>
        )}
        <div className={`max-w-[70%] ${isOwn
          ? isAgency
            ? "bg-[#FF007F]/15 border border-[#FF007F]/25 rounded-2xl rounded-tr-sm"
            : "bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-2xl rounded-tr-sm"
          : "bg-white/8 border border-white/10 rounded-2xl rounded-tl-sm"
        } px-4 py-2.5`}>
          {!isOwn && (
            <p className="text-xs font-semibold mb-1" style={{ color: roleColor }}>
              {msg.sender_name}
            </p>
          )}
          <p className="text-white text-sm leading-relaxed">{msg.content}</p>
          <p className="text-white/30 text-[10px] mt-1 text-right">{time}</p>
        </div>
      </div>
    );
  };

  const PaymentMessageBubble = ({ msg }) => {
    const isOwn = msg.sender_id === user?.user_id;
    const roleColor = getRoleColor(msg.sender_role);
    const time = new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    return (
      <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn && (
          <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {msg.sender_picture
              ? <img src={msg.sender_picture} alt="" className="w-full h-full object-cover" />
              : <span className="text-[10px] font-bold text-white/60">{(msg.sender_name || "?")[0].toUpperCase()}</span>
            }
          </div>
        )}
        <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isOwn
          ? "bg-[#f0c040]/10 border border-[#f0c040]/20 rounded-tr-sm"
          : "bg-white/8 border border-white/10 rounded-tl-sm"
        }`}>
          {!isOwn && <p className="text-xs font-semibold mb-1" style={{ color: roleColor }}>{msg.sender_name}</p>}
          <p className="text-white text-sm leading-relaxed">{msg.content}</p>
          <p className="text-white/30 text-[10px] mt-1 text-right">{time}</p>
        </div>
      </div>
    );
  };

  const ChatInput = ({ placeholder, buttonColor }) => (
    <div className="flex items-center gap-3 p-4 border-t border-white/10 bg-[#0d0d0d]">
      <input
        value={newMessage}
        onChange={e => setNewMessage(e.target.value)}
        onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
        placeholder={placeholder || "Écrire un message..."}
        className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
      />
      <button
        onClick={handleSendMessage}
        disabled={sending || !newMessage.trim()}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
        style={{ backgroundColor: buttonColor || accentColor }}
      >
        <Send className="w-4 h-4 text-white" />
      </button>
    </div>
  );

  const ClipperSidebarItem = ({ c, idx, isSelected, onClick }) => {
    const payData = paymentSummary?.clippers?.find(p => p.user_id === c.user_id);
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2.5 p-3 rounded-xl mb-1 text-left transition-all w-full border ${
          isSelected
            ? "bg-white/10 border-white/15"
            : "border-transparent hover:bg-white/5 hover:border-white/8"
        }`}
      >
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center">
            {c.picture
              ? <img src={c.picture} alt="" className="w-full h-full object-cover" />
              : <span className="text-xs font-bold text-[#00E5FF]">{(c.display_name || c.name || "?")[0].toUpperCase()}</span>
            }
          </div>
          {activeTab === "paiement" && (
            <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[#f0c040] text-black text-[8px] font-black flex items-center justify-center">
              {idx + 1}
            </span>
          )}
          {activeTab === "conseils" && c.needs_advice && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#FF007F] border border-[#0d0d0d]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{c.display_name || c.name}</p>
          {activeTab === "paiement" && payData && (
            <p className={`text-xs truncate font-mono ${payData.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
              {payData.owed > 0 ? `€${payData.owed.toFixed(2)} dû` : "✓ À jour"}
            </p>
          )}
          {activeTab === "conseils" && (
            <p className={`text-xs truncate ${c.needs_advice ? "text-[#FF007F]" : "text-white/30"}`}>
              {c.needs_advice ? "Besoin de conseil" : c.hours_since_advice ? `il y a ${formatTime(c.hours_since_advice)}` : "Jamais conseillé"}
            </p>
          )}
          {activeTab === "questions" && (
            <p className="text-xs text-white/30 truncate">
              {messages.filter(m => m.sender_id === c.user_id).length} msg
            </p>
          )}
        </div>
      </button>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d0d0d]">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-[calc(100vh-8rem)] bg-[#0d0d0d]"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
            <MessageSquare className="w-4 h-4" style={{ color: accentColor }} />
          </div>
          <h2 className="font-semibold text-white text-base tracking-tight">{campaign?.name || "Campagne"}</h2>
        </div>

        {/* Tabs pills */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {tabs.map(tab => {
            let badge = 0;
            if (tab.id === "questions") badge = tabUnread.questions;
            else if (tab.id === "conseils" && isClipper) badge = tabUnread.conseils;
            else if (tab.id === "conseils" && isAgency) badge = clippers.filter(c => c.needs_advice).length;
            else if (tab.id === "paiement") badge = paymentSummary?.clippers?.filter(c => c.owed > 0).length || 0;

            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
                  isActive
                    ? tab.id === "paiement" || tab.id === "remuneration"
                      ? "bg-[#f0c040]/15 text-[#f0c040] border-[#f0c040]/25"
                      : tab.id === "conseils"
                        ? "bg-[#FF007F]/15 text-[#FF007F] border-[#FF007F]/25"
                        : isClipper
                          ? "bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/25"
                          : "bg-[#FF007F]/15 text-[#FF007F] border-[#FF007F]/25"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5 border-transparent"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {badge > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-black px-1"
                    style={{ backgroundColor: tab.id === "questions" ? "#00E5FF" : tab.id === "conseils" ? "#FF007F" : "#f0c040" }}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left sidebar — agency only */}
        {isAgency && (activeTab === "questions" || activeTab === "conseils" || activeTab === "paiement") && (
          <div className="w-52 flex-shrink-0 flex flex-col border-r border-white/8 overflow-y-auto p-2">
            {sidebarClippers().length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-12 text-center px-2">
                <User className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-white/25 text-xs">Aucun clippeur</p>
              </div>
            ) : (
              sidebarClippers().map((c, idx) => (
                <ClipperSidebarItem
                  key={c.user_id}
                  c={c}
                  idx={idx}
                  isSelected={selectedClipper?.user_id === c.user_id}
                  onClick={() => {
                    setSelectedClipper(selectedClipper?.user_id === c.user_id ? null : c);
                    setIbanVisible(false);
                  }}
                />
              ))
            )}
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* ════════════════════════════════════════════════════════════
              ONGLET QUESTIONS
          ════════════════════════════════════════════════════════════ */}
          {activeTab === "questions" && (
            <>
              {isAgency && !selectedClipper ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                    <HelpCircle className="w-6 h-6 text-white/20" />
                  </div>
                  <p className="text-white/40 text-sm font-medium">Sélectionnez un clippeur</p>
                  <p className="text-white/20 text-xs mt-1">pour voir et répondre à ses questions</p>
                </div>
              ) : (
                <div className="flex flex-col h-full min-h-0">
                  {/* Subheader when clipper selected */}
                  {isAgency && selectedClipper && (
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8 flex-shrink-0">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                        {selectedClipper.picture
                          ? <img src={selectedClipper.picture} alt="" className="w-full h-full object-cover" />
                          : <span className="text-[9px] font-bold text-[#00E5FF]">{(selectedClipper.display_name || "?")[0].toUpperCase()}</span>
                        }
                      </div>
                      <p className="text-white/60 text-xs">
                        Conversation avec <span className="text-white font-medium">{selectedClipper.display_name || selectedClipper.name}</span>
                      </p>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {visibleMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                          <HelpCircle className="w-6 h-6 text-white/20" />
                        </div>
                        <p className="text-white/30 text-sm">Aucun message pour l'instant</p>
                        <p className="text-white/15 text-xs mt-1">Soyez le premier à écrire</p>
                      </div>
                    ) : (
                      visibleMessages.map(msg => <MessageBubble key={msg.message_id} msg={msg} />)
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <ChatInput placeholder={isClipper ? "Poser une question..." : "Répondre..."} buttonColor={accentColor} />
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              ONGLET CONSEILS — AGENCE
          ════════════════════════════════════════════════════════════ */}
          {activeTab === "conseils" && isAgency && (
            <>
              {!selectedClipper ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#FF007F]/8 flex items-center justify-center mb-4">
                    <Lightbulb className="w-6 h-6 text-[#FF007F]/40" />
                  </div>
                  <p className="text-white/40 text-sm font-medium">Sélectionnez un clippeur</p>
                  <p className="text-white/20 text-xs mt-1">pour lui envoyer un conseil personnalisé</p>
                </div>
              ) : (
                <div className="flex flex-col h-full min-h-0">
                  {/* Clipper header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 flex-shrink-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                      {selectedClipper.picture
                        ? <img src={selectedClipper.picture} alt="" className="w-full h-full object-cover" />
                        : <span className="text-xs font-bold text-[#00E5FF]">{(selectedClipper.display_name || "?")[0].toUpperCase()}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{selectedClipper.display_name || selectedClipper.name}</p>
                      <p className={`text-xs ${selectedClipper.needs_advice ? "text-[#FF007F]" : "text-white/35"}`}>
                        {selectedClipper.needs_advice
                          ? "Besoin d'un conseil"
                          : selectedClipper.hours_since_advice
                            ? `Dernier conseil il y a ${formatTime(selectedClipper.hours_since_advice)}`
                            : "Jamais conseillé"}
                      </p>
                    </div>
                    {/* Social links */}
                    {selectedClipper.social_accounts?.length > 0 && (
                      <div className="flex gap-1">
                        {selectedClipper.social_accounts.map((acc, i) => {
                          const link = acc.account_url || (
                            acc.platform === "tiktok" ? `https://tiktok.com/@${acc.username}` :
                            acc.platform === "instagram" ? `https://instagram.com/${acc.username}` :
                            `https://youtube.com/@${acc.username}`
                          );
                          const colors = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF0000" };
                          return (
                            <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
                              style={{ color: colors[acc.platform] || "#fff" }}
                              title={`@${acc.username} (${acc.platform})`}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Historique conseils envoyés */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                    {visibleConseilMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <Lightbulb className="w-8 h-8 text-white/10 mb-3" />
                        <p className="text-white/25 text-xs">Aucun conseil envoyé à ce clippeur</p>
                      </div>
                    ) : (
                      visibleConseilMessages.map(msg => <MessageBubble key={msg.message_id} msg={msg} />)
                    )}
                    <div ref={conseilsEndRef} />
                  </div>

                  {/* Textarea conseil */}
                  <div className="flex-shrink-0 border-t border-white/8 p-4 space-y-3">
                    <Textarea
                      value={adviceContent}
                      onChange={e => setAdviceContent(e.target.value)}
                      placeholder={`Écrire un conseil pour ${selectedClipper.display_name || selectedClipper.name}...`}
                      rows={3}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 resize-none transition-colors"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSendAdvice}
                        disabled={sending || !adviceContent.trim()}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF007F] hover:bg-[#FF007F]/90 disabled:opacity-30 text-white text-sm font-semibold transition-all"
                      >
                        <Lightbulb className="w-4 h-4" />
                        Envoyer le conseil
                      </button>
                      {/* Quick message */}
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          value={newMessage}
                          onChange={e => setNewMessage(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                          placeholder="Message rapide..."
                          className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={sending || !newMessage.trim()}
                          className="w-10 h-10 rounded-xl bg-[#FF007F]/20 hover:bg-[#FF007F]/40 border border-[#FF007F]/30 disabled:opacity-30 flex items-center justify-center transition-all"
                        >
                          <Send className="w-4 h-4 text-[#FF007F]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              ONGLET CONSEILS — CLIPPER
          ════════════════════════════════════════════════════════════ */}
          {activeTab === "conseils" && isClipper && (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                {receivedAdvices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <Lightbulb className="w-10 h-10 text-white/10 mb-3" />
                    <p className="text-white/30 text-sm">Aucun conseil reçu</p>
                    <p className="text-white/15 text-xs mt-1">Ton agence t'enverra des conseils ici</p>
                  </div>
                ) : (
                  receivedAdvices.map((adv) => (
                    <div key={adv.advice_id} className="bg-white/5 border border-[#FF007F]/15 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-[#FF007F]/20 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {adv.sender?.picture
                            ? <img src={adv.sender.picture} alt="" className="w-full h-full object-cover" />
                            : <Lightbulb className="w-3 h-3 text-[#FF007F]" />
                          }
                        </div>
                        <p className="text-xs text-[#FF007F] font-semibold">{adv.sender?.display_name || "Manager"}</p>
                        <p className="text-[10px] text-white/25 ml-auto">
                          {new Date(adv.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <p className="text-white/80 text-sm leading-relaxed">{adv.content}</p>
                    </div>
                  ))
                )}

                {/* Conversation conseils */}
                {conseilChatMessages.length > 0 && (
                  <div className="pt-3 mt-1 border-t border-white/8 space-y-3">
                    <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium text-center">Conversation</p>
                    {conseilChatMessages.map(msg => <MessageBubble key={msg.message_id} msg={msg} />)}
                  </div>
                )}
                <div ref={conseilsEndRef} />
              </div>

              <ChatInput placeholder="Répondre à ton agence..." buttonColor="#FF007F" />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              ONGLET RÉMUNÉRATION — CLIPPER
          ════════════════════════════════════════════════════════════ */}
          {activeTab === "remuneration" && isClipper && (
            <div className="flex flex-col h-full min-h-0">
              {!paymentSummary ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-white/10 border-t-[#f0c040] rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Stats card */}
                  <div className="flex-shrink-0 mx-4 mt-4 mb-3 rounded-2xl bg-[#1a1a1a] border border-white/8 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-[#f0c040]" />
                      <p className="text-xs text-white/40 font-medium uppercase tracking-wider">À percevoir</p>
                    </div>
                    <p className="text-3xl font-bold text-[#f0c040] font-mono mb-3">
                      €{paymentSummary.owed?.toFixed(2) || "0.00"}
                    </p>
                    <div className="h-px bg-white/8 mb-3" />
                    <div className="flex items-center gap-3 text-xs text-white/40 flex-wrap">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(paymentSummary.views)} vues</span>
                      <span className="text-white/15">·</span>
                      <span>€{paymentSummary.earned?.toFixed(2) || "0.00"} total</span>
                      {paymentSummary.paid > 0 && (
                        <>
                          <span className="text-white/15">·</span>
                          <span className="text-[#39FF14]">€{paymentSummary.paid.toFixed(2)} payé</span>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-white/20 mt-2">
                      {fmt(paymentSummary.views)} vues × €{paymentSummary.rpm}/1 000 vues = €{paymentSummary.earned?.toFixed(2) || "0.00"}
                    </p>

                    {/* CTA */}
                    <div className="mt-3">
                      {paymentSummary.owed > 0 ? (
                        <button
                          onClick={handleClaimPayment}
                          disabled={claimingPayment}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#f0c040] hover:bg-[#f0c040]/90 disabled:opacity-50 text-black font-bold text-sm transition-all"
                        >
                          {claimingPayment
                            ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Envoi...</>
                            : <>💰 Demander à être payé (€{paymentSummary.owed.toFixed(2)})</>
                          }
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/20">
                          <CheckCircle className="w-4 h-4 text-[#39FF14]" />
                          <p className="text-[#39FF14] text-sm font-medium">Tout est à jour</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Erreur RIB */}
                  {noRibError && (
                    <div className="mx-4 mb-3 bg-red-500/8 border border-red-500/25 rounded-xl p-3 flex-shrink-0">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-red-400 text-xs font-medium">IBAN / PayPal manquant</p>
                      </div>
                      <button
                        onClick={() => navigate("/clipper/settings")}
                        className="w-full py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium transition-all border border-red-500/20"
                      >
                        → Paramètres — renseigner mon IBAN / PayPal
                      </button>
                    </div>
                  )}

                  {/* Chat rémunération */}
                  <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-0">
                    {remunerationMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <CreditCard className="w-8 h-8 text-white/10 mb-3" />
                        <p className="text-white/25 text-xs">Ton fil de paiement</p>
                        <p className="text-white/15 text-[10px] mt-1">Réclame ton argent ou échange avec l'agence ici</p>
                      </div>
                    ) : (
                      remunerationMessages.map(msg => <PaymentMessageBubble key={msg.message_id} msg={msg} />)
                    )}
                    <div ref={remunerationEndRef} />
                  </div>

                  <ChatInput placeholder="Message à l'agence..." buttonColor="#f0c040" />
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              ONGLET PAIEMENT — AGENCE
          ════════════════════════════════════════════════════════════ */}
          {activeTab === "paiement" && isAgency && (
            <>
              {!selectedClipper ? (
                /* Vue liste */
                <div className="flex flex-col h-full min-h-0">
                  {/* Summary header */}
                  {paymentSummary?.clippers?.length > 0 && (
                    <div className="flex-shrink-0 mx-4 mt-4 mb-4 grid grid-cols-2 gap-3">
                      <div className="bg-white/5 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Total vues</p>
                        <p className="text-white font-mono font-bold text-xl">
                          {fmt(paymentSummary.clippers.reduce((s, c) => s + (c.views || 0), 0))}
                        </p>
                      </div>
                      <div className="bg-[#f0c040]/8 border border-[#f0c040]/20 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Total à payer</p>
                        <p className="text-[#f0c040] font-mono font-bold text-xl">
                          €{paymentSummary.clippers.reduce((s, c) => s + (c.owed || 0), 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium px-4 mb-2">
                    Cliquezur un clippeur pour gérer son paiement
                  </p>

                  <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
                    {(paymentSummary?.clippers || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-center">
                        <DollarSign className="w-8 h-8 text-white/10 mb-2" />
                        <p className="text-white/25 text-sm">Aucun clippeur actif</p>
                      </div>
                    ) : (
                      (paymentSummary?.clippers || []).map((pd) => {
                        const clipper = clippers.find(c => c.user_id === pd.user_id) || pd;
                        return (
                          <button
                            key={pd.user_id}
                            onClick={() => { setSelectedClipper(clipper); setIbanVisible(false); }}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/4 hover:bg-white/8 border border-white/6 hover:border-white/12 transition-all text-left"
                          >
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                              {clipper.picture
                                ? <img src={clipper.picture} alt="" className="w-full h-full object-cover" />
                                : <span className="text-sm font-bold text-[#00E5FF]">{(pd.display_name || pd.name || "?")[0].toUpperCase()}</span>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{pd.display_name || pd.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-white/35">{fmt(pd.views)} vues</span>
                                <span className="text-white/15">·</span>
                                <span className="text-xs text-[#00E5FF]">€{pd.earned?.toFixed(2)} gagnés</span>
                              </div>
                            </div>
                            {pd.owed > 0 ? (
                              <span className="flex-shrink-0 text-xs font-mono font-bold text-[#f0c040] bg-[#f0c040]/12 border border-[#f0c040]/20 px-2.5 py-1 rounded-lg">
                                €{pd.owed.toFixed(2)} dû
                              </span>
                            ) : (
                              <span className="flex-shrink-0 flex items-center gap-1 text-xs font-mono text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 px-2.5 py-1 rounded-lg">
                                <CheckCircle className="w-3 h-3" /> Payé
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (() => {
                const pd = paymentSummary?.clippers?.find(c => c.user_id === selectedClipper.user_id);
                return (
                  <div className="flex flex-col h-full min-h-0">
                    {/* Back button */}
                    <div className="flex-shrink-0 px-4 pt-3 pb-2">
                      <button
                        onClick={() => setSelectedClipper(null)}
                        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Tous les clippeurs
                      </button>
                    </div>

                    {/* Clipper card + IBAN */}
                    <div className="flex-shrink-0 mx-4 mb-3 p-3.5 bg-white/4 border border-white/8 rounded-2xl flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                        {selectedClipper.picture
                          ? <img src={selectedClipper.picture} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-bold text-[#00E5FF]">{(selectedClipper.display_name || "?")[0].toUpperCase()}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{selectedClipper.display_name || selectedClipper.name}</p>
                        {pd?.payment_info ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <CreditCard className="w-3 h-3 text-[#f0c040] flex-shrink-0" />
                            <span
                              className="text-xs font-mono text-[#f0c040] truncate transition-all"
                              style={!ibanVisible ? { filter: "blur(5px)", userSelect: "none" } : {}}
                            >
                              {pd.payment_info}
                            </span>
                            <button
                              onClick={() => setIbanVisible(v => !v)}
                              className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0 ml-1"
                            >
                              {ibanVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-white/20 italic mt-0.5">Pas d'IBAN/PayPal renseigné</p>
                        )}
                      </div>
                      {pd?.owed > 0 ? (
                        <span className="flex-shrink-0 text-xs font-mono font-bold text-[#f0c040] bg-[#f0c040]/12 border border-[#f0c040]/20 px-2 py-1 rounded-lg">
                          €{pd.owed.toFixed(2)}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-xs font-mono text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 px-2 py-1 rounded-lg">
                          ✓
                        </span>
                      )}
                    </div>

                    {/* Stats 3 colonnes */}
                    {pd && (
                      <div className="flex-shrink-0 mx-4 mb-3 grid grid-cols-3 gap-2">
                        <div className="bg-white/4 border border-white/8 rounded-xl p-2.5 text-center">
                          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Vues</p>
                          <p className="text-white font-mono font-bold text-sm">{fmt(pd.views)}</p>
                        </div>
                        <div className="bg-[#00E5FF]/5 border border-[#00E5FF]/15 rounded-xl p-2.5 text-center">
                          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Gagné</p>
                          <p className="text-[#00E5FF] font-mono font-bold text-sm">€{pd.earned?.toFixed(2)}</p>
                        </div>
                        <div className={`rounded-xl p-2.5 text-center border ${pd.owed > 0 ? "bg-[#f0c040]/8 border-[#f0c040]/20" : "bg-[#39FF14]/8 border-[#39FF14]/20"}`}>
                          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">À payer</p>
                          <p className={`font-mono font-bold text-sm ${pd.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                            {pd.owed > 0 ? `€${pd.owed.toFixed(2)}` : "✓"}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Chat rémunération scrollable */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-0">
                      {remunerationMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <CreditCard className="w-8 h-8 text-white/8 mb-2" />
                          <p className="text-white/20 text-xs">Fil de paiement</p>
                          <p className="text-white/12 text-[10px] mt-0.5">Les messages de paiement apparaissent ici</p>
                        </div>
                      ) : (
                        remunerationMessages.map(msg => <PaymentMessageBubble key={msg.message_id} msg={msg} />)
                      )}
                      <div ref={remunerationEndRef} />
                    </div>

                    {/* Actions fixes en bas */}
                    <div className="flex-shrink-0 border-t border-white/8 p-4 space-y-3">
                      {pd?.owed > 0 ? (
                        <div>
                          <button
                            onClick={handleConfirmPayment}
                            disabled={confirmingPayment}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#f0c040] hover:bg-[#f0c040]/90 disabled:opacity-50 text-black font-bold text-sm transition-all"
                          >
                            {confirmingPayment
                              ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Confirmation...</>
                              : <>✅ J'ai effectué le virement de €{pd.owed.toFixed(2)}</>
                            }
                          </button>
                          <p className="text-[10px] text-white/20 text-center mt-1.5">
                            Faites le virement depuis votre banque/PayPal AVANT de cliquer
                          </p>
                        </div>
                      ) : pd?.earned > 0 ? (
                        <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#39FF14]/8 border border-[#39FF14]/15">
                          <CheckCircle className="w-4 h-4 text-[#39FF14]" />
                          <p className="text-[#39FF14] text-sm font-medium">Ce clippeur est à jour</p>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-3">
                        <input
                          value={newMessage}
                          onChange={e => setNewMessage(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                          placeholder="Message de paiement..."
                          className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={sending || !newMessage.trim()}
                          className="w-10 h-10 rounded-xl bg-[#f0c040]/20 hover:bg-[#f0c040]/40 border border-[#f0c040]/30 disabled:opacity-30 flex items-center justify-center transition-all"
                        >
                          <Send className="w-4 h-4 text-[#f0c040]" />
                        </button>
                      </div>

                      {pd && (
                        <p className="text-[10px] text-white/15 text-center">
                          {fmt(pd.views)} vues × €{paymentSummary?.rpm}/1 000 vues = €{pd.earned?.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}

        </div>
      </div>
    </motion.div>
  );
}
