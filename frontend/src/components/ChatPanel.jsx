import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import { motion } from "framer-motion";
import {
  Send, MessageCircle, HelpCircle, Lightbulb, Clock, AlertCircle,
  User, DollarSign, Eye, EyeOff, CheckCircle, CreditCard, ChevronRight, ExternalLink, TrendingUp
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

  useEffect(() => {
    if (!campaignId) return;
    fetchMessages();
    fetchClippers();
    fetchPaymentSummary();
    fetchReceivedAdvices();
    connectWebSocket();
    // Marquer les messages comme lus à l'ouverture
    markRead();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [campaignId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Calcul non-lus Questions ────────────────────────────────────────────
  useEffect(() => {
    if (!messages.length) return;
    const lastSeen = getLastSeen("questions");
    if (activeTab === "questions") {
      // On est sur l'onglet — reset immédiat
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
        // Nouveau conseil reçu (clippeur)
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
        // Envoyer une notification automatique dans le chat paiement
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
    // Vérifier que le RIB/PayPal est renseigné
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

  const fmt = (n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n || 0);
  const getRoleColor = (role) => ({ clipper: "#00E5FF", agency: "#FF007F", manager: "#39FF14", client: "#FFB300" }[role] || "#fff");
  const formatTime = (h) => h < 24 ? `${Math.round(h)}h` : `${Math.floor(h / 24)}j`;

  // Sidebar clipper list sorted per tab
  const sidebarClippers = () => {
    if (activeTab === "paiement" && paymentSummary?.clippers) {
      return [...paymentSummary.clippers].sort((a, b) => b.earned - a.earned);
    }
    if (activeTab === "conseils") {
      // Le moins conseillé (le + longtemps sans conseil) remonte en PREMIER
      return [...clippers].sort((a, b) => {
        const hoursA = a.hours_since_advice ?? Infinity; // jamais conseillé = priorité max
        const hoursB = b.hours_since_advice ?? Infinity;
        return hoursB - hoursA;
      });
    }
    return clippers;
  };

  // Messages séparés par onglet — chaque tab a sa propre conversation
  const questionMessages = messages.filter(m => !m.message_type || m.message_type === "question" || m.message_type === "chat");
  const conseilChatMessages = messages.filter(m => m.message_type === "conseil");
  const remunerationMessages = messages.filter(m => m.message_type === "remuneration");

  // Messages filtrés pour le clippeur sélectionné (onglet Questions)
  const visibleMessages = selectedClipper
    ? questionMessages.filter(m => m.sender_id === selectedClipper.user_id || m.sender_id === user?.user_id)
    : questionMessages;

  // Messages Conseils filtrés par clippeur sélectionné (agence)
  const visibleConseilMessages = selectedClipper
    ? conseilChatMessages.filter(m => m.sender_id === selectedClipper.user_id || m.sender_id === user?.user_id)
    : conseilChatMessages;

  if (!campaignId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/50">Sélectionnez une campagne</p>
      </div>
    );
  }

  const tabs = [
    { id: "questions", label: "Questions", icon: HelpCircle },
    { id: "conseils", label: "Conseils", icon: Lightbulb },
    ...(isAgencyOnly ? [{ id: "paiement", label: "Paiement", icon: DollarSign }] : []),
    ...(isClipper ? [{ id: "remuneration", label: "Rémunération", icon: DollarSign }] : []),
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header + Tabs */}
      <div className="border-b border-white/10 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white/70" />
          </div>
          <h2 className="font-display font-bold text-lg text-white">{campaign?.name || "Campagne"}</h2>
        </div>
        <div className="flex gap-1 bg-white/5 p-1 rounded-lg w-fit">
          {tabs.map(tab => {
            // Calcul du badge pour chaque onglet
            let badge = 0;
            if (tab.id === "questions") {
              badge = tabUnread.questions;
            } else if (tab.id === "conseils" && isClipper) {
              badge = tabUnread.conseils;
            } else if (tab.id === "conseils" && isAgency) {
              badge = clippers.filter(c => c.needs_advice).length;
            } else if (tab.id === "paiement") {
              badge = paymentSummary?.clippers?.filter(c => c.owed > 0).length || 0;
            }

            const badgeColor = tab.id === "questions" ? "#00E5FF"
              : tab.id === "conseils" ? "#FF007F"
              : "#f0c040";

            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? (tab.id === "paiement" || tab.id === "remuneration") ? "bg-[#f0c040]/20 text-[#f0c040]"
                      : tab.id === "conseils" ? "bg-[#FF007F]/20 text-[#FF007F]"
                      : "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}>
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {badge > 0 && (
                  <span
                    className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-black px-1"
                    style={{ backgroundColor: badgeColor }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-column layout (agency) or single column (clipper) */}
      <div className="flex flex-1 min-h-0 pt-3 gap-3">

        {/* ---- LEFT SIDEBAR (agency only) ---- */}
        {isAgency && (
          <div className="w-56 flex-shrink-0 flex flex-col border-r border-white/10 pr-3 overflow-y-auto">
            {sidebarClippers().length === 0 ? (
              <p className="text-white/30 text-xs text-center pt-8">Aucun clippeur</p>
            ) : (
              sidebarClippers().map((c, idx) => {
                const payData = paymentSummary?.clippers?.find(p => p.user_id === (c.user_id || c.user_id));
                const isSelected = selectedClipper?.user_id === (c.user_id);
                return (
                  <button key={c.user_id} onClick={() => setSelectedClipper(isSelected ? null : c)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl mb-1 text-left transition-all w-full ${
                      isSelected ? "bg-white/10" : "hover:bg-white/5"
                    }`}>
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center">
                        {c.picture
                          ? <img src={c.picture} alt="" className="w-full h-full object-cover" />
                          : <User className="w-4 h-4 text-[#00E5FF]" />}
                      </div>
                      {activeTab === "paiement" && (
                        <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[#f0c040] text-black text-[8px] font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                      )}
                      {activeTab === "conseils" && c.needs_advice && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#FF007F] border border-[#0d0d0d]" />
                      )}
                    </div>
                    {/* Info */}
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
                          {messages.filter(m => m.sender_id === c.user_id).length} message{messages.filter(m => m.sender_id === c.user_id).length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    {isSelected && <ChevronRight className="w-3 h-3 text-white/30 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ---- RIGHT PANEL ---- */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* === QUESTIONS TAB === */}
          {activeTab === "questions" && (
            <>
              {isAgency && !selectedClipper ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <HelpCircle className="w-10 h-10 text-white/20 mb-3" />
                  <p className="text-white/40 text-sm">Sélectionnez un clippeur</p>
                  <p className="text-white/20 text-xs">pour voir sa conversation</p>
                </div>
              ) : (
                <>
                  {isAgency && selectedClipper && (
                    <p className="text-xs text-white/40 mb-3 flex items-center gap-1">
                      <User className="w-3 h-3" /> Conversation avec <strong className="text-white ml-1">{selectedClipper.display_name || selectedClipper.name}</strong>
                    </p>
                  )}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {loading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      </div>
                    ) : visibleMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <HelpCircle className="w-10 h-10 text-white/20 mb-3" />
                        <p className="text-white/40 text-sm">Aucune question pour l'instant</p>
                      </div>
                    ) : (
                      visibleMessages.map((msg) => {
                        const isOwn = msg.sender_id === user?.user_id;
                        const roleColor = getRoleColor(msg.sender_role);
                        return (
                          <div key={msg.message_id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${isOwn ? "bg-white/10" : "bg-white/5"}`}
                              style={{ borderLeft: isOwn ? "none" : `3px solid ${roleColor}` }}>
                              {!isOwn && (
                                <p className="text-xs font-medium mb-1" style={{ color: roleColor }}>
                                  {msg.sender_name}
                                </p>
                              )}
                              <p className="text-white text-sm leading-relaxed">{msg.content}</p>
                              <p className="text-xs text-white/30 mt-1">
                                {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="pt-3 border-t border-white/10 mt-3">
                    <div className="flex gap-2">
                      <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                        placeholder={user?.role === "clipper" ? "Poser une question..." : "Répondre..."}
                        className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm" />
                      <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}
                        className="bg-white/10 hover:bg-white/20 text-white px-3">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* === CONSEILS TAB === */}
          {activeTab === "conseils" && (
            <>
              {isAgency ? (
                /* Agency/Manager: send advice to a clipper */
                !selectedClipper ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Lightbulb className="w-10 h-10 text-white/20 mb-3" />
                    <p className="text-white/40 text-sm">Sélectionnez un clippeur</p>
                    <p className="text-white/20 text-xs">pour lui envoyer un conseil</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full overflow-y-auto">
                    {/* Clipper header */}
                    <div className="flex items-center gap-2 mb-3 p-3 bg-white/5 rounded-xl flex-shrink-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center">
                        {selectedClipper.picture
                          ? <img src={selectedClipper.picture} alt="" className="w-full h-full object-cover" />
                          : <User className="w-4 h-4 text-[#00E5FF]" />}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{selectedClipper.display_name || selectedClipper.name}</p>
                        <p className={`text-xs ${selectedClipper.needs_advice ? "text-[#FF007F]" : "text-white/40"}`}>
                          {selectedClipper.needs_advice ? "⚠ Besoin de conseil" : selectedClipper.hours_since_advice
                            ? `Dernier conseil il y a ${formatTime(selectedClipper.hours_since_advice)}`
                            : "Jamais conseillé"}
                        </p>
                      </div>
                    </div>

                    {/* Social accounts */}
                    {selectedClipper.social_accounts && selectedClipper.social_accounts.length > 0 && (
                      <div className="mb-3 flex-shrink-0">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-2 font-medium">Comptes sociaux</p>
                        <div className="space-y-1.5">
                          {selectedClipper.social_accounts.map((acc, i) => {
                            const platformColors = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF0000" };
                            const platformEmojis = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };
                            const color = platformColors[acc.platform] || "#fff";
                            const link = acc.account_url || (
                              acc.platform === "tiktok" ? `https://tiktok.com/@${acc.username}` :
                              acc.platform === "instagram" ? `https://instagram.com/${acc.username}` :
                              acc.platform === "youtube" ? `https://youtube.com/@${acc.username}` :
                              null
                            );
                            return (
                              <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
                                style={{ borderLeft: `2px solid ${color}40` }}>
                                <span className="text-sm">{platformEmojis[acc.platform] || "🔗"}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate" style={{ color }}>
                                    {acc.platform.charAt(0).toUpperCase() + acc.platform.slice(1)}
                                  </p>
                                  <p className="text-xs text-white/50 truncate">@{acc.username}</p>
                                </div>
                                <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60 flex-shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Messages conseils avec ce clippeur */}
                    {visibleConseilMessages.length > 0 && (
                      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-0">
                        {visibleConseilMessages.map((msg) => {
                          const isOwn = msg.sender_id === user?.user_id;
                          const roleColor = getRoleColor(msg.sender_role);
                          return (
                            <div key={msg.message_id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isOwn ? "bg-white/10" : "bg-white/5"}`}
                                style={{ borderLeft: isOwn ? "none" : `2px solid ${roleColor}` }}>
                                <p className="text-white text-sm leading-relaxed">{msg.content}</p>
                                <p className="text-xs text-white/30 mt-0.5">{new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {visibleConseilMessages.length === 0 && <div className="flex-1" />}
                    <div className="space-y-3 flex-shrink-0">
                      <Textarea value={adviceContent} onChange={e => setAdviceContent(e.target.value)}
                        placeholder={`Écrivez un conseil pour ${selectedClipper.display_name || selectedClipper.name}...`}
                        rows={3}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm resize-none" />
                      <Button onClick={handleSendAdvice} disabled={sending || !adviceContent.trim()}
                        className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white w-full">
                        <Send className="w-4 h-4 mr-2" />
                        Envoyer le conseil
                      </Button>
                      {/* Chat rapide — type conseil */}
                      <div className="border-t border-white/10 pt-3">
                        <p className="text-xs text-white/30 mb-2">Message rapide</p>
                        <div className="flex gap-2">
                          <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                            placeholder="Message court..."
                            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm" />
                          <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}
                            className="bg-[#FF007F]/20 hover:bg-[#FF007F]/40 text-[#FF007F] px-3 border border-[#FF007F]/30">
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                /* Clipper: conseils reçus + chat */
                <div className="flex flex-col h-full min-h-0">
                  {/* Conseils reçus */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
                    {receivedAdvices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center pt-12 text-center">
                        <Lightbulb className="w-10 h-10 text-white/20 mb-3" />
                        <p className="text-white/40 text-sm">Aucun conseil reçu pour l'instant</p>
                        <p className="text-white/20 text-xs mt-1">Ton manager ou agence t'enverra des conseils ici</p>
                      </div>
                    ) : (
                      receivedAdvices.map((adv) => (
                        <div key={adv.advice_id} className="bg-[#FF007F]/5 border border-[#FF007F]/20 rounded-2xl px-4 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0">
                              {adv.sender?.picture
                                ? <img src={adv.sender.picture} alt="" className="w-full h-full object-cover" />
                                : <Lightbulb className="w-3 h-3 text-[#FF007F]" />}
                            </div>
                            <p className="text-xs text-[#FF007F] font-medium">{adv.sender?.display_name || "Manager"}</p>
                            <p className="text-xs text-white/30 ml-auto">{new Date(adv.created_at).toLocaleDateString("fr-FR")}</p>
                          </div>
                          <p className="text-white/80 text-sm leading-relaxed">{adv.content}</p>
                        </div>
                      ))
                    )}
                    {/* Conversation Conseils (messages type=conseil) */}
                    {conseilChatMessages.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                        <p className="text-xs text-white/25 uppercase tracking-wider font-medium">Conversation</p>
                        {conseilChatMessages.map((msg) => {
                          const isOwn = msg.sender_id === user?.user_id;
                          const roleColor = getRoleColor(msg.sender_role);
                          return (
                            <div key={msg.message_id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isOwn ? "bg-white/10" : "bg-white/5"}`}
                                style={{ borderLeft: isOwn ? "none" : `3px solid ${roleColor}` }}>
                                {!isOwn && <p className="text-xs font-medium mb-1" style={{ color: roleColor }}>{msg.sender_name}</p>}
                                <p className="text-white text-sm leading-relaxed">{msg.content}</p>
                                <p className="text-xs text-white/30 mt-1">{new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={conseilsEndRef} />
                      </div>
                    )}
                  </div>
                  {/* Input réponse */}
                  <div className="pt-3 border-t border-white/10 flex-shrink-0">
                    <div className="flex gap-2">
                      <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                        placeholder="Répondre à ton agence..."
                        className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm" />
                      <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}
                        className="bg-[#FF007F]/20 hover:bg-[#FF007F]/40 text-[#FF007F] px-3 border border-[#FF007F]/30">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* === PAIEMENT TAB (agency) === */}
          {activeTab === "paiement" && isAgency && (
            <>
              {!selectedClipper ? (
                /* Vue globale — tous les clippers */
                <div className="overflow-y-auto space-y-2 pr-1">
                  {paymentSummary?.clippers?.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/5 rounded-xl p-3 text-center">
                        <p className="text-xs text-white/40 mb-1">Total vues campagne</p>
                        <p className="text-white font-mono font-bold text-lg">{fmt(paymentSummary.clippers.reduce((s, c) => s + (c.views || 0), 0))}</p>
                      </div>
                      <div className="bg-[#f0c040]/10 rounded-xl p-3 text-center">
                        <p className="text-xs text-white/40 mb-1">Total à payer</p>
                        <p className="text-[#f0c040] font-mono font-bold text-lg">€{paymentSummary.clippers.reduce((s, c) => s + (c.owed || 0), 0).toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-white/30 mb-2 uppercase tracking-wider font-medium">Cliquez sur un clippeur pour gérer son paiement</p>
                  {(paymentSummary?.clippers || []).map((pd) => {
                    const clipper = clippers.find(c => c.user_id === pd.user_id) || pd;
                    return (
                      <button key={pd.user_id} onClick={() => { setSelectedClipper(clipper); setIbanVisible(false); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-left border border-transparent hover:border-white/10">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                          {clipper.picture ? <img src={clipper.picture} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-[#00E5FF]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{pd.display_name || pd.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-white/40">{fmt(pd.views)} vues</span>
                            <span className="text-white/20">·</span>
                            <span className="text-xs text-[#00E5FF]">€{pd.earned.toFixed(2)} gagnés</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {pd.owed > 0 ? (
                            <span className="text-xs font-mono font-bold text-[#f0c040] bg-[#f0c040]/10 px-2 py-1 rounded-lg">€{pd.owed.toFixed(2)} dû</span>
                          ) : (
                            <span className="text-xs font-mono text-[#39FF14] bg-[#39FF14]/10 px-2 py-1 rounded-lg">✓ Payé</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {(!paymentSummary?.clippers?.length) && (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <DollarSign className="w-8 h-8 text-white/20 mb-2" />
                      <p className="text-white/40 text-sm">Aucun clippeur actif</p>
                    </div>
                  )}
                </div>
              ) : (() => {
                const pd = paymentSummary?.clippers?.find(c => c.user_id === selectedClipper.user_id);
                return (
                  <div className="flex flex-col h-full min-h-0">
                    {/* Back */}
                    <button onClick={() => setSelectedClipper(null)} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-2 flex-shrink-0">
                      <ChevronRight className="w-3 h-3 rotate-180" /> Tous les clippeurs
                    </button>

                    {/* Header clipper + IBAN */}
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 flex-shrink-0 mb-2">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                        {selectedClipper.picture ? <img src={selectedClipper.picture} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-[#00E5FF]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{selectedClipper.display_name || selectedClipper.name}</p>
                        {pd?.payment_info ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <CreditCard className="w-3 h-3 text-[#f0c040] flex-shrink-0" />
                            <span className="text-xs font-mono text-[#f0c040] truncate"
                              style={!ibanVisible ? { filter: "blur(5px)", userSelect: "none" } : {}}>
                              {pd.payment_info}
                            </span>
                            <button onClick={() => setIbanVisible(v => !v)} className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0 ml-1">
                              {ibanVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-white/20 italic mt-0.5">Pas d'IBAN/PayPal renseigné</p>
                        )}
                      </div>
                      {pd?.owed > 0 ? (
                        <span className="text-xs font-mono font-bold text-[#f0c040] bg-[#f0c040]/10 px-2 py-1 rounded-lg flex-shrink-0">€{pd.owed.toFixed(2)}</span>
                      ) : (
                        <span className="text-xs font-mono text-[#39FF14] bg-[#39FF14]/10 px-2 py-1 rounded-lg flex-shrink-0">✓ Payé</span>
                      )}
                    </div>

                    {/* Stats compactes */}
                    {pd && (
                      <div className="grid grid-cols-3 gap-2 flex-shrink-0 mb-2">
                        <div className="bg-white/5 rounded-xl p-2 text-center">
                          <p className="text-[10px] text-white/40 mb-0.5">Vues</p>
                          <p className="text-white font-mono font-bold text-sm">{fmt(pd.views)}</p>
                        </div>
                        <div className="bg-[#00E5FF]/5 rounded-xl p-2 text-center border border-[#00E5FF]/10">
                          <p className="text-[10px] text-white/40 mb-0.5">Gagné</p>
                          <p className="text-[#00E5FF] font-mono font-bold text-sm">€{pd.earned.toFixed(2)}</p>
                        </div>
                        <div className={`rounded-xl p-2 text-center border ${pd.owed > 0 ? "bg-[#f0c040]/10 border-[#f0c040]/20" : "bg-[#39FF14]/10 border-[#39FF14]/20"}`}>
                          <p className="text-[10px] text-white/40 mb-0.5">À payer</p>
                          <p className={`font-mono font-bold text-sm ${pd.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                            {pd.owed > 0 ? `€${pd.owed.toFixed(2)}` : "✓"}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Chat rémunération — scrollable */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2 min-h-0">
                      {remunerationMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center pt-4">
                          <DollarSign className="w-8 h-8 text-white/10 mb-2" />
                          <p className="text-white/30 text-sm">Fil de paiement</p>
                          <p className="text-white/20 text-xs mt-1">Les messages de paiement apparaissent ici</p>
                        </div>
                      ) : (
                        remunerationMessages.map((msg) => {
                          const isOwn = msg.sender_id === user?.user_id;
                          const roleColor = getRoleColor(msg.sender_role);
                          return (
                            <div key={msg.message_id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isOwn ? "bg-[#f0c040]/10 border border-[#f0c040]/20" : "bg-white/5"}`}
                                style={{ borderLeft: isOwn ? undefined : `3px solid ${roleColor}` }}>
                                {!isOwn && <p className="text-xs font-medium mb-1" style={{ color: roleColor }}>{msg.sender_name}</p>}
                                <p className="text-white text-sm leading-relaxed">{msg.content}</p>
                                <p className="text-xs text-white/30 mt-1">
                                  {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={remunerationEndRef} />
                    </div>

                    {/* Actions fixes en bas */}
                    <div className="flex-shrink-0 border-t border-white/10 pt-2 space-y-2">
                      {pd?.owed > 0 && (
                        <Button onClick={handleConfirmPayment} disabled={confirmingPayment}
                          className="w-full bg-[#f0c040] hover:bg-[#f0c040]/90 text-black font-bold py-2.5 text-sm">
                          {confirmingPayment
                            ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />Confirmation...</>
                            : <>✅ Marquer €{pd.owed.toFixed(2)} comme payé</>}
                        </Button>
                      )}
                      {pd?.owed === 0 && pd?.earned > 0 && (
                        <div className="bg-[#39FF14]/5 border border-[#39FF14]/20 rounded-xl p-3 text-center">
                          <p className="text-[#39FF14] font-medium text-sm">✓ Ce clippeur est à jour</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                          placeholder="Message de paiement..."
                          className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm" />
                        <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}
                          className="bg-[#f0c040]/20 hover:bg-[#f0c040]/40 text-[#f0c040] px-3 border border-[#f0c040]/30">
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                      {pd && (
                        <p className="text-[11px] text-white/20 text-center pb-1">
                          {fmt(pd.views)} vues × €{paymentSummary?.rpm}/1 000 vues = €{pd.earned.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* === RÉMUNÉRATION TAB (clipper) === */}
          {activeTab === "remuneration" && isClipper && (
            <div className="flex flex-col h-full min-h-0">
              {!paymentSummary ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-[#f0c040] rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* ── Chat rémunération — occupe tout l'espace disponible ── */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2 min-h-0">
                    {remunerationMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center pt-8">
                        <DollarSign className="w-10 h-10 text-white/10 mb-3" />
                        <p className="text-white/30 text-sm">Ton fil de paiement</p>
                        <p className="text-white/20 text-xs mt-1">Réclame ton argent ou échange avec l'agence ici</p>
                      </div>
                    ) : (
                      remunerationMessages.map((msg) => {
                        const isOwn = msg.sender_id === user?.user_id;
                        const roleColor = getRoleColor(msg.sender_role);
                        return (
                          <div key={msg.message_id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isOwn ? "bg-[#f0c040]/10 border border-[#f0c040]/20" : "bg-white/5"}`}
                              style={{ borderLeft: isOwn ? undefined : `3px solid ${roleColor}` }}>
                              {!isOwn && <p className="text-xs font-medium mb-1" style={{ color: roleColor }}>{msg.sender_name}</p>}
                              <p className="text-white text-sm leading-relaxed">{msg.content}</p>
                              <p className="text-xs text-white/30 mt-1">
                                {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={remunerationEndRef} />
                  </div>

                  {/* ── Section fixe en bas ── */}
                  <div className="flex-shrink-0 pt-3 border-t border-white/10 space-y-2">

                    {/* Stats compactes */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-white/40 flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(paymentSummary.views)} vues</span>
                        <span className="text-white/20">·</span>
                        <span className="text-[#f0c040] font-mono font-semibold">€{paymentSummary.earned?.toFixed(2) || "0.00"}</span>
                        {paymentSummary.paid > 0 && (
                          <>
                            <span className="text-white/20">·</span>
                            <span className="text-[#39FF14] text-xs">payé €{paymentSummary.paid.toFixed(2)}</span>
                          </>
                        )}
                      </div>
                      {paymentSummary.owed > 0 && (
                        <span className="text-xs font-mono font-bold text-[#f0c040] bg-[#f0c040]/10 px-2 py-0.5 rounded-lg">
                          €{paymentSummary.owed.toFixed(2)} dû
                        </span>
                      )}
                      {paymentSummary.owed === 0 && paymentSummary.earned > 0 && (
                        <span className="text-xs text-[#39FF14]">✓ À jour</span>
                      )}
                    </div>

                    {/* Erreur RIB manquant */}
                    {noRibError && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-red-400 text-xs font-medium">IBAN / PayPal manquant</p>
                        </div>
                        <button onClick={() => navigate("/clipper/settings")}
                          className="w-full py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-all border border-red-500/20">
                          → Paramètres — renseigner mon IBAN / PayPal
                        </button>
                      </div>
                    )}

                    {/* Bouton Réclamer juste au-dessus de l'input */}
                    {paymentSummary.owed > 0 && (
                      <Button onClick={handleClaimPayment} disabled={claimingPayment}
                        className="w-full bg-[#f0c040] hover:bg-[#f0c040]/90 text-black font-bold py-2.5 text-sm">
                        {claimingPayment
                          ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />Envoi...</>
                          : <>💰 Réclamer €{paymentSummary.owed.toFixed(2)}</>}
                      </Button>
                    )}

                    {/* Input chat */}
                    <div className="flex gap-2">
                      <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                        placeholder="Message à l'agence..."
                        className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm" />
                      <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}
                        className="bg-[#f0c040]/20 hover:bg-[#f0c040]/40 text-[#f0c040] px-3 border border-[#f0c040]/30">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Formule en texte discret sous l'input */}
                    <p className="text-[11px] text-white/20 text-center pb-1">
                      {fmt(paymentSummary.views)} vues × €{paymentSummary.rpm}/1 000 vues = €{paymentSummary.earned?.toFixed(2) || "0.00"}
                      {paymentSummary.joined_at && ` · depuis le ${new Date(paymentSummary.joined_at).toLocaleDateString("fr-FR")}`}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
