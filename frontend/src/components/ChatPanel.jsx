import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth, API } from "../App";
import { motion } from "framer-motion";
import {
  Send, MessageCircle, HelpCircle, Lightbulb, Clock, AlertCircle,
  User, DollarSign, Eye, CheckCircle, CreditCard, ChevronRight
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

export default function ChatPanel({ campaigns }) {
  const location = useLocation();
  const { user } = useAuth();
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
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

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
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [campaignId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When tab changes, reset selected clipper
  useEffect(() => {
    setSelectedClipper(null);
  }, [activeTab]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/messages`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages((data.messages || []).filter(m => m.message_type === "question" || m.message_type === "chat"));
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

  const connectWebSocket = () => {
    if (!user?.user_id) return;
    const wsUrl = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000")
      .replace("https://", "wss://").replace("http://", "ws://");
    try {
      wsRef.current = new WebSocket(`${wsUrl}/ws/${user.user_id}`);
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.message.campaign_id === campaignId) {
          if (data.message.message_type === "question" || data.message.message_type === "chat") {
            setMessages((prev) => prev.find(m => m.message_id === data.message.message_id) ? prev : [...prev, data.message]);
          }
        }
      };
      wsRef.current.onclose = () => setTimeout(connectWebSocket, 3000);
    } catch {}
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !campaignId) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaign_id: campaignId, content: newMessage.trim(), message_type: "question" }),
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
        fetchPaymentSummary();
      }
    } catch {}
    finally { setConfirmingPayment(false); }
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
      return [...clippers].sort((a, b) => (b.needs_advice ? 1 : 0) - (a.needs_advice ? 1 : 0));
    }
    return clippers;
  };

  // Messages filtered for selected clipper (Questions tab)
  const visibleMessages = selectedClipper
    ? messages.filter(m => m.sender_id === selectedClipper.user_id || m.sender_id === user?.user_id)
    : messages;

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
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? (tab.id === "paiement" || tab.id === "remuneration") ? "bg-[#f0c040]/20 text-[#f0c040]"
                    : tab.id === "conseils" ? "bg-[#FF007F]/20 text-[#FF007F]"
                    : "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/70"
              }`}>
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === "conseils" && clippers.filter(c => c.needs_advice).length > 0 && (
                <span className="px-1.5 py-0.5 bg-[#FF007F]/20 text-[#FF007F] rounded-full text-xs">
                  {clippers.filter(c => c.needs_advice).length}
                </span>
              )}
              {tab.id === "paiement" && paymentSummary?.clippers?.some(c => c.owed > 0) && (
                <span className="px-1.5 py-0.5 bg-[#f0c040]/20 text-[#f0c040] rounded-full text-xs">
                  {paymentSummary.clippers.filter(c => c.owed > 0).length}
                </span>
              )}
            </button>
          ))}
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
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-4 p-3 bg-white/5 rounded-xl">
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
                    <div className="flex-1" />
                    <div className="space-y-3">
                      <Textarea value={adviceContent} onChange={e => setAdviceContent(e.target.value)}
                        placeholder={`Écrivez un conseil pour ${selectedClipper.display_name || selectedClipper.name}...`}
                        rows={4}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm resize-none" />
                      <Button onClick={handleSendAdvice} disabled={sending || !adviceContent.trim()}
                        className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white w-full">
                        <Send className="w-4 h-4 mr-2" />
                        Envoyer le conseil
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                /* Clipper: view received advice */
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {receivedAdvices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center pt-16">
                      <Lightbulb className="w-10 h-10 text-white/20 mb-3" />
                      <p className="text-white/40 text-sm">Aucun conseil reçu pour l'instant</p>
                      <p className="text-white/20 text-xs mt-1">Votre manager ou agence vous enverra des conseils ici</p>
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
                </div>
              )}
            </>
          )}

          {/* === PAIEMENT TAB === */}
          {activeTab === "paiement" && (
            <>
              {isAgency ? (
                !selectedClipper ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <DollarSign className="w-10 h-10 text-white/20 mb-3" />
                    <p className="text-white/40 text-sm">Sélectionnez un clippeur</p>
                    <p className="text-white/20 text-xs">pour voir ses gains</p>
                  </div>
                ) : (() => {
                  const pd = paymentSummary?.clippers?.find(c => c.user_id === selectedClipper.user_id);
                  return (
                    <div className="space-y-4 overflow-y-auto pr-1">
                      {/* Clipper header */}
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center">
                          {selectedClipper.picture
                            ? <img src={selectedClipper.picture} alt="" className="w-full h-full object-cover" />
                            : <User className="w-5 h-5 text-[#00E5FF]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium">{selectedClipper.display_name || selectedClipper.name}</p>
                          {pd?.payment_info
                            ? <p className="text-xs text-[#f0c040] flex items-center gap-1"><CreditCard className="w-3 h-3" />{pd.payment_info}</p>
                            : <p className="text-xs text-white/30 italic">Aucun IBAN/PayPal renseigné</p>}
                        </div>
                      </div>
                      {pd && (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                              <p className="text-xs text-white/40 mb-1 flex items-center justify-center gap-1"><Eye className="w-3 h-3" />Vues</p>
                              <p className="text-white font-mono font-bold">{fmt(pd.views)}</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                              <p className="text-xs text-white/40 mb-1">Total gagné</p>
                              <p className="text-[#00E5FF] font-mono font-bold">€{pd.earned.toFixed(2)}</p>
                            </div>
                            <div className={`rounded-xl p-3 text-center ${pd.owed > 0 ? "bg-[#f0c040]/10" : "bg-[#39FF14]/10"}`}>
                              <p className="text-xs text-white/40 mb-1">À payer</p>
                              <p className={`font-mono font-bold ${pd.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                                {pd.owed > 0 ? `€${pd.owed.toFixed(2)}` : "✓"}
                              </p>
                            </div>
                          </div>
                          {pd.last_payment && (
                            <p className="text-xs text-white/30 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-[#39FF14]" />
                              Dernier virement : €{pd.last_payment.amount_eur?.toFixed(2)} le {new Date(pd.last_payment.confirmed_at).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                          {pd.owed > 0 && (
                            <Button onClick={handleConfirmPayment} disabled={confirmingPayment}
                              className="w-full bg-[#f0c040]/20 hover:bg-[#f0c040]/30 border border-[#f0c040]/40 text-[#f0c040] font-medium">
                              {confirmingPayment ? "..." : `✓ Marquer €${pd.owed.toFixed(2)} comme payé`}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()
              ) : null}
            </>
          )}

          {/* === RÉMUNÉRATION TAB (clipper) === */}
          {activeTab === "remuneration" && isClipper && (
            <div className="space-y-4 overflow-y-auto pr-1">
              {!paymentSummary ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-[#f0c040] rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="bg-[#f0c040]/10 border border-[#f0c040]/20 rounded-xl p-5 text-center">
                    <p className="text-xs text-white/40 mb-1">Total gagné sur cette campagne</p>
                    <p className="text-[#f0c040] font-mono font-black text-4xl">€{paymentSummary.earned?.toFixed(2) || "0.00"}</p>
                    {paymentSummary.paid > 0 && (
                      <p className="text-xs text-white/30 mt-2">Déjà payé : €{paymentSummary.paid.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <p className="text-xs text-white/40 mb-1 flex items-center justify-center gap-1"><Eye className="w-3 h-3" />Vues</p>
                      <p className="text-white font-mono font-bold">{fmt(paymentSummary.views)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <p className="text-xs text-white/40 mb-1">RPM</p>
                      <p className="text-white font-mono font-bold">€{paymentSummary.rpm}/1K</p>
                    </div>
                  </div>
                  <div className={`rounded-xl p-4 text-center border ${paymentSummary.owed > 0 ? "bg-[#f0c040]/5 border-[#f0c040]/20" : "bg-[#39FF14]/5 border-[#39FF14]/20"}`}>
                    <p className="text-xs text-white/40 mb-1">Montant dû par l'agence</p>
                    <p className={`font-mono font-bold text-2xl ${paymentSummary.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                      {paymentSummary.owed > 0 ? `€${paymentSummary.owed?.toFixed(2)}` : "✓ Tout payé"}
                    </p>
                    {paymentSummary.last_payment && (
                      <p className="text-xs text-white/30 mt-2 flex items-center justify-center gap-1">
                        <CheckCircle className="w-3 h-3 text-[#39FF14]" />
                        Dernier virement : €{paymentSummary.last_payment.amount_eur?.toFixed(2)} le {new Date(paymentSummary.last_payment.confirmed_at).toLocaleDateString("fr-FR")}
                      </p>
                    )}
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
