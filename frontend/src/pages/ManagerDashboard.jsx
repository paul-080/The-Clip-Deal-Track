import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  Bell, Settings, MessageCircle, Video, ClipboardList,
  Users, Eye, Send, AlertTriangle, Check
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import ChatPanel from "../components/ChatPanel";

const ACCENT_COLOR = "#39FF14";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [reminderStatus, setReminderStatus] = useState({ show_reminder: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [campaignsRes, reminderRes] = await Promise.all([
        fetch(`${API}/campaigns`, { credentials: "include" }),
        fetch(`${API}/manager/reminder-status`, { credentials: "include" }),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (reminderRes.ok) {
        const data = await reminderRes.json();
        setReminderStatus(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { 
      id: "reminder", 
      label: "Rappel conseils", 
      icon: Bell, 
      path: "/manager",
      notification: reminderStatus.show_reminder
    },
    { type: "divider" },
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/manager/campaign/${c.campaign_id}`,
      children: [
        {
          id: `chat-${c.campaign_id}`,
          label: `Chat — ${c.name}`,
          icon: MessageCircle,
          path: `/manager/campaign/${c.campaign_id}/chat`,
        },
      ],
    })),
    { type: "divider" },
    { id: "advices", label: "Conseils", icon: ClipboardList, path: "/manager/advices" },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/manager/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar 
        items={sidebarItems} 
        accentColor={ACCENT_COLOR}
        role="manager"
      />
      <main className="flex-1 ml-64 p-8">
        <Routes>
          <Route index element={<ReminderPage reminderStatus={reminderStatus} />} />
          <Route path="campaign/:campaignId" element={<CampaignDashboard campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="advices" element={<AdvicesPage campaigns={campaigns} />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// Reminder Page
function ReminderPage({ reminderStatus }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-reminder-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Rappel conseils</h1>
        <p className="text-white/50">N'oubliez pas de guider votre équipe</p>
      </div>

      {reminderStatus.show_reminder ? (
        <Card className="bg-[#39FF14]/10 border-[#39FF14]/30">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[#39FF14]/20 flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-[#39FF14]" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white mb-2">
                Il est temps de donner un conseil !
              </h3>
              <p className="text-white/60">
                {reminderStatus.hours_since_last 
                  ? `Cela fait ${Math.round(reminderStatus.hours_since_last)} heures depuis votre dernier conseil.`
                  : "Vous n'avez pas encore envoyé de conseil."}
                <br />
                N'oubliez pas de donner un conseil à votre équipe pour les aider à progresser.
              </p>
              <Button className="mt-4 bg-[#39FF14] hover:bg-[#39FF14]/80 text-black">
                Envoyer un conseil
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#39FF14]/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-[#39FF14]" />
            </div>
            <h3 className="font-bold text-lg text-white mb-2">Tout est à jour !</h3>
            <p className="text-white/50">
              Vous avez récemment envoyé un conseil à votre équipe.
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

// Campaign Dashboard for Manager
function CampaignDashboard({ campaigns }) {
  const location = useLocation();
  const campaignId = location.pathname.split("/")[3];
  const campaign = campaigns.find((c) => c.campaign_id === campaignId);
  const [campaignDetails, setCampaignDetails] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (campaignId) {
      fetchData();
    }
  }, [campaignId]);

  const fetchData = async () => {
    try {
      const [campaignRes, statsRes] = await Promise.all([
        fetch(`${API}/campaigns/${campaignId}`, { credentials: "include" }),
        fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" }),
      ]);

      if (campaignRes.ok) {
        const data = await campaignRes.json();
        setCampaignDetails(data);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">Campagne non trouvée</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-campaign-dashboard"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">{campaign.name}</h1>
        <p className="text-white/50">Suivi de la campagne</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50">Vues totales</p>
            <p className="font-mono font-bold text-2xl text-white">
              {stats?.total_views?.toLocaleString() || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50">Clippeurs</p>
            <p className="font-mono font-bold text-2xl text-white">
              {stats?.clipper_count || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50">Strikes actifs</p>
            <p className="font-mono font-bold text-2xl text-red-400">
              {stats?.clipper_stats?.filter(c => c.strikes > 0).length || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Clippers List */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-[#39FF14]" />
            Clippeurs de la campagne
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.clipper_stats || stats.clipper_stats.length === 0 ? (
            <p className="text-white/50 text-center py-8">Aucun clippeur</p>
          ) : (
            <div className="space-y-3">
              {stats.clipper_stats.map((clipper, index) => (
                <div
                  key={clipper.user_id}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    clipper.strikes > 0 ? "bg-red-500/10 border border-red-500/30" : "bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-white/50">#{index + 1}</span>
                    <div>
                      <p className="text-white font-medium">Clippeur {index + 1}</p>
                      {clipper.strikes > 0 && (
                        <Badge className="bg-red-500/20 text-red-400 text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {clipper.strikes} strike(s)
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-white">{clipper.views?.toLocaleString()} vues</p>
                    <p className="text-sm text-[#39FF14]">€{clipper.earnings?.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Advices Page
function AdvicesPage({ campaigns }) {
  const [advices, setAdvices] = useState([]);
  const [content, setContent] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedClippers, setSelectedClippers] = useState([]);
  const [campaignClippers, setCampaignClippers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchAdvices();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchCampaignClippers();
    }
  }, [selectedCampaign]);

  const fetchAdvices = async () => {
    try {
      const res = await fetch(`${API}/advices`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAdvices(data.advices || []);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const fetchCampaignClippers = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${selectedCampaign}/stats`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaignClippers(data.clipper_stats || []);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const toggleClipper = (userId) => {
    setSelectedClippers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSend = async () => {
    if (!content.trim() || !selectedCampaign || selectedClippers.length === 0) {
      toast.error("Veuillez remplir tous les champs et sélectionner des clippeurs");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/advices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          campaign_id: selectedCampaign,
          recipient_ids: selectedClippers,
          content: content.trim(),
        }),
      });

      if (res.ok) {
        toast.success("Conseil envoyé !");
        setContent("");
        setSelectedClippers([]);
        fetchAdvices();
      }
    } catch (error) {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="advices-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Conseils</h1>
        <p className="text-white/50">Envoyez des conseils à vos clippeurs</p>
      </div>

      {/* Send Advice Form */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Nouveau conseil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Campagne</label>
            <select
              value={selectedCampaign}
              onChange={(e) => {
                setSelectedCampaign(e.target.value);
                setSelectedClippers([]);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-md p-3 text-white"
              data-testid="select-campaign-advice"
            >
              <option value="">Sélectionner une campagne</option>
              {campaigns.map((c) => (
                <option key={c.campaign_id} value={c.campaign_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCampaign && (
            <div>
              <label className="block text-sm text-white/70 mb-2">Destinataires</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {campaignClippers.length === 0 ? (
                  <p className="text-white/50 text-sm">Aucun clippeur dans cette campagne</p>
                ) : (
                  campaignClippers.map((clipper, i) => (
                    <label key={clipper.user_id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedClippers.includes(clipper.user_id)}
                        onCheckedChange={() => toggleClipper(clipper.user_id)}
                        className="border-white/30"
                      />
                      <span className="text-white">Clippeur {i + 1}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-white/70 mb-2">Message</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Écrivez votre conseil..."
              rows={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="advice-content-input"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={isSubmitting}
            className="bg-[#39FF14] hover:bg-[#39FF14]/80 text-black"
            data-testid="send-advice-btn"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? "Envoi..." : "Envoyer"}
          </Button>
        </CardContent>
      </Card>

      {/* Advice History */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Historique des conseils</CardTitle>
        </CardHeader>
        <CardContent>
          {advices.length === 0 ? (
            <p className="text-white/50 text-center py-8">Aucun conseil envoyé</p>
          ) : (
            <div className="space-y-4">
              {advices.map((advice) => (
                <div key={advice.advice_id} className="p-4 bg-white/5 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/50">
                      {new Date(advice.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge className="bg-[#39FF14]/20 text-[#39FF14]">
                      {advice.recipient_ids?.length || 0} destinataire(s)
                    </Badge>
                  </div>
                  <p className="text-white">{advice.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Settings Page
function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-settings-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paramètres</h1>
        <p className="text-white/50">Informations de votre compte</p>
      </div>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Nom</label>
            <p className="text-white">{user?.display_name || user?.name}</p>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Email</label>
            <p className="text-white/50">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={logout}
        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        data-testid="logout-btn-manager"
      >
        Se déconnecter
      </Button>
    </motion.div>
  );
}
