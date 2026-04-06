import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { motion } from "framer-motion";
import { Settings, MessageCircle, Video, Eye, Users } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import ChatPanel from "../components/ChatPanel";

const ACCENT_COLOR = "#FFB300";

export default function ClientDashboard() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API}/campaigns`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/client/campaign/${c.campaign_id}`,
      children: [
        {
          id: `chat-${c.campaign_id}`,
          label: `Chat — ${c.name}`,
          icon: MessageCircle,
          path: `/client/campaign/${c.campaign_id}/chat`,
        },
      ],
    })),
    { type: "divider" },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/client/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar 
        items={sidebarItems} 
        accentColor={ACCENT_COLOR}
        role="client"
      />
      <main className="flex-1 ml-64 p-8">
        <Routes>
          <Route index element={<ClientHome campaigns={campaigns} />} />
          <Route path="campaign/:campaignId" element={<CampaignView campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// Client Home
function ClientHome({ campaigns }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="client-home"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Mes campagnes</h1>
        <p className="text-white/50">Suivez vos campagnes de clipping</p>
      </div>

      {campaigns.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <Eye className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">
              Vous n'avez pas encore de campagnes.
              <br />
              Utilisez un lien d'invitation pour rejoindre une campagne.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <Card 
              key={campaign.campaign_id} 
              className="bg-[#121212] border-white/10 hover:border-[#FFB300]/30 transition-colors duration-200 cursor-pointer"
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-[#FFB300]/20 flex items-center justify-center">
                    <Video className="w-6 h-6 text-[#FFB300]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white truncate">{campaign.name}</h3>
                    <Badge variant="outline" className="border-[#39FF14]/30 text-[#39FF14] text-xs">
                      {campaign.status}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">RPM</span>
                    <span className="font-mono text-white">€{campaign.rpm}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Plateformes</span>
                    <div className="flex gap-1">
                      {campaign.platforms?.map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs bg-white/5">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Campaign View for Client
function CampaignView({ campaigns }) {
  const location = useLocation();
  const campaignId = location.pathname.split("/")[3];
  const campaign = campaigns.find((c) => c.campaign_id === campaignId);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (campaignId) {
      fetchStats();
    }
  }, [campaignId]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

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
      data-testid="client-campaign-view"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">{campaign.name}</h1>
        <p className="text-white/50">Vue de la campagne</p>
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
            <p className="text-sm text-white/50">Clippeurs actifs</p>
            <p className="font-mono font-bold text-2xl text-white">
              {stats?.clipper_count || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50">RPM</p>
            <p className="font-mono font-bold text-2xl text-[#FFB300]">
              €{campaign.rpm}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Details */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Détails de la campagne</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-white/50 mb-1">Budget</p>
              <p className="text-white font-mono">
                {campaign.budget_unlimited ? "Illimité" : `€${campaign.budget_total}`}
              </p>
            </div>
            <div>
              <p className="text-sm text-white/50 mb-1">Budget utilisé</p>
              <p className="text-white font-mono">€{campaign.budget_used || 0}</p>
            </div>
            <div>
              <p className="text-sm text-white/50 mb-1">Min. vues</p>
              <p className="text-white font-mono">{campaign.min_view_payout}</p>
            </div>
            <div>
              <p className="text-sm text-white/50 mb-1">Max. vues</p>
              <p className="text-white font-mono">{campaign.max_view_payout || "∞"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Clippers */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-[#FFB300]" />
            Top clippeurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.clipper_stats || stats.clipper_stats.length === 0 ? (
            <p className="text-white/50 text-center py-8">Aucun clippeur</p>
          ) : (
            <div className="space-y-3">
              {stats.clipper_stats.slice(0, 5).map((clipper, index) => (
                <div
                  key={clipper.user_id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-[#FFB300]">#{index + 1}</span>
                    <span className="text-white">Clippeur</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-white">{clipper.views?.toLocaleString()} vues</p>
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

// Settings Page
function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="client-settings-page"
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
        data-testid="logout-btn-client"
      >
        Se déconnecter
      </Button>
    </motion.div>
  );
}
