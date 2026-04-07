import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  Home, Search, Plus, Link2, CreditCard, Settings, MessageCircle,
  Video, Users, User, Eye, DollarSign, Copy, Check, Image, AlertTriangle,
  TrendingUp, BarChart3
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import ChatPanel from "../components/ChatPanel";

const ACCENT_COLOR = "#FF007F";

export default function AgencyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [campaignsRes, announcementsRes] = await Promise.all([
        fetch(`${API}/campaigns`, { credentials: "include" }),
        fetch(`${API}/announcements`, { credentials: "include" }),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (announcementsRes.ok) {
        const data = await announcementsRes.json();
        setAnnouncements(data.announcements || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { id: "home", label: "Accueil — Annonces", icon: Home, path: "/agency" },
    { id: "discover", label: "Découvrir", icon: Search, path: "/agency/discover" },
    { id: "create", label: "Lancer une campagne", icon: Plus, path: "/agency/create" },
    { type: "divider" },
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/agency/campaign/${c.campaign_id}`,
      children: [
        {
          id: `chat-${c.campaign_id}`,
          label: `Chat — ${c.name}`,
          icon: MessageCircle,
          path: `/agency/campaign/${c.campaign_id}/chat`,
        },
      ],
    })),
    { type: "divider" },
    { id: "links", label: "Liens d'accès", icon: Link2, path: "/agency/links" },
    { id: "payment", label: "Paiement", icon: CreditCard, path: "/agency/payment" },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/agency/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar 
        items={sidebarItems} 
        accentColor={ACCENT_COLOR}
        role="agency"
      />
      <main className="flex-1 ml-64 p-8">
        <Routes>
          <Route index element={<AgencyHome announcements={announcements} onUpdate={fetchData} />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="create" element={<CreateCampaign onCreated={fetchData} />} />
          <Route path="campaign/:campaignId" element={<CampaignDashboard campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// Agency Home with Announcements
function AgencyHome({ announcements, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, content }),
      });

      if (res.ok) {
        toast.success("Annonce publiée");
        setTitle("");
        setContent("");
        setShowForm(false);
        onUpdate();
      }
    } catch (error) {
      toast.error("Erreur lors de la publication");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-home"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-white mb-2">Accueil — Annonces</h1>
          <p className="text-white/50">Publiez des annonces pour vos clippeurs</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
          data-testid="new-announcement-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle annonce
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#121212] border-[#FF007F]/30">
          <CardContent className="p-6 space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de l'annonce"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="announcement-title-input"
            />
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Contenu de l'annonce..."
              rows={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="announcement-content-input"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
                data-testid="publish-announcement-btn"
              >
                {isSubmitting ? "Publication..." : "Publier"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="border-white/10 text-white"
              >
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {announcements.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">Aucune annonce publiée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <Card key={ann.announcement_id} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg text-white">{ann.title}</h3>
                  <span className="text-xs text-white/30">
                    {new Date(ann.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <p className="text-white/60">{ann.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Discover Page for Agency
function DiscoverPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API}/campaigns/discover`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-discover"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Découvrir</h1>
        <p className="text-white/50">Campagnes des autres agences (lecture seule)</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="skeleton h-8 w-3/4 rounded mb-4" />
                <div className="skeleton h-4 w-1/2 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div key={campaign.campaign_id} data-campaign-id={campaign.campaign_id} data-campaign-name={campaign.name} className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all group">
              {/* Cover */}
              <div
                className="h-32 relative overflow-hidden"
                style={{ background: campaign.image_url ? `url(${campaign.image_url}) center/cover no-repeat` : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
              >
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute top-3 right-3 flex gap-1">
                  {(campaign.platforms || []).map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/20 font-medium">
                      {p === "tiktok" ? "TikTok" : p === "instagram" ? "IG" : p === "youtube" ? "YT" : p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-4 space-y-2">
                {campaign.agency_name && <p className="text-xs text-white/40">{campaign.agency_name}</p>}
                <h3 className="text-white font-bold text-sm leading-tight group-hover:text-[#FF007F] transition-colors">{campaign.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#39FF14] bg-[#39FF14]/10 px-2 py-0.5 rounded-md">
                    💰 {campaign.rpm || 0}€ / 1K vues
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/40">
                    <span>Budget</span>
                    <span>{Math.round(((campaign.budget_used || 0) / (campaign.budget_total || 1)) * 100)}%</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, ((campaign.budget_used || 0) / (campaign.budget_total || 1)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Create Campaign Page
function CreateCampaign({ onCreated }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    image_url: "",
    rpm: "",
    budget_total: "",
    budget_unlimited: false,
    min_view_payout: "0",
    max_view_payout: "",
    platforms: [],
    strike_days: "24",
    cadence: "1",
    application_form_enabled: false,
    application_questions: [],
  });
  const [customQuestion, setCustomQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const togglePlatform = (platform) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const addQuestion = () => {
    if (customQuestion.trim()) {
      setFormData((prev) => ({
        ...prev,
        application_questions: [...prev.application_questions, customQuestion.trim()],
      }));
      setCustomQuestion("");
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.rpm) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        rpm: parseFloat(formData.rpm),
        budget_total: formData.budget_unlimited ? null : parseFloat(formData.budget_total) || null,
        min_view_payout: parseInt(formData.min_view_payout) || 0,
        max_view_payout: formData.max_view_payout ? parseInt(formData.max_view_payout) : null,
        strike_hours: parseInt(formData.strike_days) || 24,
        cadence: parseInt(formData.cadence) || 1,
      };

      const res = await fetch(`${API}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const campaign = await res.json();
        toast.success("Campagne créée !");
        onCreated();
        navigate(`/agency/campaign/${campaign.campaign_id}`);
      } else {
        const error = await res.json();
        toast.error(error.detail || "Erreur lors de la création");
      }
    } catch (error) {
      toast.error("Erreur de connexion");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 max-w-3xl"
      data-testid="create-campaign-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Lancer une campagne</h1>
        <p className="text-white/50">Créez une nouvelle campagne de clipping</p>
      </div>

      {/* Identity */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Image className="w-5 h-5 text-[#FF007F]" />
            Identité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Nom de la campagne *</label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Ex: Clips Gaming 2025"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="campaign-name-input"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Image de la campagne (optionnel)</label>
            <div className="flex items-center gap-3">
              {formData.image_url && (
                <img src={formData.image_url} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
              )}
              <label className="flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                <Image className="w-4 h-4 text-white/50" />
                <span className="text-sm text-white/50">{formData.image_url ? "Changer la photo" : "Choisir une photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => handleChange("image_url", ev.target.result);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remuneration */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#FF007F]" />
            Rémunération
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">RPM (€ par 1000 vues) *</label>
            <Input
              type="number"
              step="0.01"
              value={formData.rpm}
              onChange={(e) => handleChange("rpm", e.target.value)}
              placeholder="3.50"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="campaign-rpm-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Budget total (€)</label>
              <Input
                type="number"
                value={formData.budget_total}
                onChange={(e) => handleChange("budget_total", e.target.value)}
                placeholder="10000"
                disabled={formData.budget_unlimited}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 disabled:opacity-50"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.budget_unlimited}
                  onCheckedChange={(checked) => handleChange("budget_unlimited", checked)}
                  className="border-white/30"
                />
                <span className="text-white/70">Budget illimité</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Min. vues payout</label>
              <Input
                type="number"
                value={formData.min_view_payout}
                onChange={(e) => handleChange("min_view_payout", e.target.value)}
                placeholder="1000"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Max. vues payout</label>
              <Input
                type="number"
                value={formData.max_view_payout}
                onChange={(e) => handleChange("max_view_payout", e.target.value)}
                placeholder="1000000"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platforms */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Plateformes cibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {["tiktok", "youtube", "instagram"].map((platform) => (
              <label key={platform} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.platforms.includes(platform)}
                  onCheckedChange={() => togglePlatform(platform)}
                  className="border-white/30"
                  data-testid={`platform-${platform}`}
                />
                <span className="text-white capitalize">{platform}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#FF007F]" />
            Règles de publication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Strike automatique après</label>
              <div className="flex gap-2">
                {["24", "48", "72"].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleChange("strike_days", h)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      formData.strike_days === h
                        ? "bg-[#FF007F] border-[#FF007F] text-white"
                        : "bg-white/5 border-white/10 text-white/50 hover:border-white/30"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Cadence (posts/jour min)</label>
              <Input
                type="number"
                value={formData.cadence}
                onChange={(e) => handleChange("cadence", e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Form */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Formulaire de candidature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={formData.application_form_enabled}
              onCheckedChange={(checked) => handleChange("application_form_enabled", checked)}
              className="border-white/30"
            />
            <span className="text-white/70">Activer le formulaire de candidature</span>
          </label>
          
          {formData.application_form_enabled && (
            <div className="space-y-3 pl-6">
              <p className="text-sm text-white/50">Questions par défaut:</p>
              <ul className="text-sm text-white/70 space-y-1">
                <li>• Nom / Prénom ?</li>
                <li>• Donnez une vidéo créée ?</li>
              </ul>
              
              {formData.application_questions.map((q, i) => (
                <div key={i} className="text-sm text-white/70">• {q}</div>
              ))}
              
              <div className="flex gap-2">
                <Input
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Ajouter une question..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <Button
                  type="button"
                  onClick={addQuestion}
                  variant="outline"
                  className="border-white/10 text-white"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full bg-[#FF007F] hover:bg-[#FF007F]/80 text-white py-6 text-lg"
        data-testid="create-campaign-btn"
      >
        {isSubmitting ? "Création en cours..." : "Créer la campagne"}
      </Button>
    </motion.div>
  );
}

// Campaign Dashboard for Agency
function CampaignDashboard({ campaigns }) {
  const location = useLocation();
  const campaignId = location.pathname.split("/")[3];
  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [pendingMembers, setPendingMembers] = useState([]);
  const [processingMember, setProcessingMember] = useState(null);

  useEffect(() => {
    if (campaignId) {
      fetchCampaign();
      fetchStats();
      fetchPendingMembers();
    }
  }, [campaignId]);

  const fetchCampaign = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaign(data);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const fetchPendingMembers = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/pending-members`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPendingMembers(data.members || []);
      }
    } catch (error) {
      console.error("Error fetching pending members:", error);
    }
  };

  const handleAcceptMember = async (memberId) => {
    setProcessingMember(memberId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${memberId}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Candidature acceptée !");
        fetchPendingMembers();
        fetchCampaign();
      } else {
        toast.error("Erreur lors de l'acceptation");
      }
    } catch {
      toast.error("Erreur réseau");
    }
    setProcessingMember(null);
  };

  const handleRejectMember = async (memberId) => {
    setProcessingMember(memberId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${memberId}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Candidature refusée");
        fetchPendingMembers();
      } else {
        toast.error("Erreur lors du refus");
      }
    } catch {
      toast.error("Erreur réseau");
    }
    setProcessingMember(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#FF007F] border-t-transparent rounded-full animate-spin" />
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

  const budgetPercentage = campaign.budget_total 
    ? Math.min(100, (campaign.budget_used / campaign.budget_total) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-campaign-dashboard"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">{campaign.name}</h1>
        <Badge variant="outline" className="border-[#39FF14]/30 text-[#39FF14]">
          {campaign.status}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "overview" ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"
          }`}
        >
          Aperçu
        </button>
        <button
          onClick={() => { setActiveTab("candidatures"); fetchPendingMembers(); }}
          className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "candidatures" ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"
          }`}
        >
          Candidatures
          {pendingMembers.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
              {pendingMembers.length}
            </span>
          )}
        </button>
      </div>

      {/* Candidatures Tab */}
      {activeTab === "candidatures" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-lg">
              Candidatures en attente
              {pendingMembers.length > 0 && (
                <span className="ml-2 bg-[#FF007F] text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingMembers.length}
                </span>
              )}
            </h3>
            <button onClick={fetchPendingMembers} className="text-white/40 hover:text-white text-xs transition-colors underline">
              Rafraîchir
            </button>
          </div>
          {pendingMembers.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm">Aucune candidature en attente</p>
            </div>
          ) : (
            pendingMembers.map(member => (
              <div key={member.member_id} className="bg-[#121212] border border-white/10 rounded-xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#FF007F]/20 flex items-center justify-center text-[#FF007F] font-bold text-sm flex-shrink-0">
                  {(member.user_info?.display_name || member.user_info?.name || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">
                    {member.user_info?.display_name || member.user_info?.name || "Clipper"}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">
                    Postulé le {member.joined_at ? new Date(member.joined_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "Date inconnue"}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {member.tiktok && <span className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">TikTok: @{member.tiktok}</span>}
                    {member.instagram && <span className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">IG: @{member.instagram}</span>}
                    {member.youtube && <span className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">YT: @{member.youtube}</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAcceptMember(member.member_id)}
                    disabled={processingMember === member.member_id}
                    className="px-3 py-1.5 rounded-lg bg-[#39FF14]/10 hover:bg-[#39FF14]/20 text-[#39FF14] text-xs font-semibold border border-[#39FF14]/30 transition-colors disabled:opacity-50"
                  >
                    ✓ Accepter
                  </button>
                  <button
                    onClick={() => handleRejectMember(member.member_id)}
                    disabled={processingMember === member.member_id}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/30 transition-colors disabled:opacity-50"
                  >
                    ✗ Refuser
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && <>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/50">Vues totales</p>
                <p className="font-mono font-bold text-2xl text-white">
                  {stats?.total_views?.toLocaleString() || 0}
                </p>
              </div>
              <Eye className="w-8 h-8 text-white/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/50">Clippeurs</p>
                <p className="font-mono font-bold text-2xl text-white">
                  {stats?.clipper_count || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-white/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/50">RPM</p>
                <p className="font-mono font-bold text-2xl text-[#FF007F]">
                  €{campaign.rpm}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-[#FF007F]/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/50">Budget utilisé</p>
                <p className="font-mono font-bold text-2xl text-white">
                  €{stats?.budget_used || 0}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-white/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Progress */}
      {!campaign.budget_unlimited && campaign.budget_total && (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/70">Budget</span>
              <span className="text-white font-mono">
                €{campaign.budget_used || 0} / €{campaign.budget_total}
              </span>
            </div>
            <Progress value={budgetPercentage} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Clippers Ranking */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#FF007F]" />
            Classement des clippeurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!campaign.members || campaign.members.filter(m => m.status === "active").length === 0 ? (
            <p className="text-white/50 text-center py-8">Aucun clippeur actif</p>
          ) : (
            <div className="space-y-3">
              {campaign.members.filter(m => m.status === "active").map((member, index) => (
                <div
                  key={member.member_id}
                  className={`relative flex items-center justify-between p-4 rounded-lg ${
                    member.strikes > 0 ? "bg-red-500/10 border border-red-500/30" : "bg-white/5"
                  }`}
                >
                  {member.strikes > 0 && (
                    <div className="absolute -top-2 left-4 bg-red-500 text-white text-xs px-2 py-0.5 rounded">
                      {member.strikes} strike(s)
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-lg text-white/50 w-8">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="text-white font-medium">
                        {member.user_info?.display_name || member.user_info?.name}
                      </p>
                      <p className="text-xs text-white/50">{member.user_info?.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-white">
                      {stats?.clipper_stats?.[index]?.views?.toLocaleString() || 0} vues
                    </p>
                    <p className="text-sm text-[#FF007F]">
                      €{stats?.clipper_stats?.[index]?.earnings?.toFixed(2) || "0.00"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </>}
    </motion.div>
  );
}

// Links Page
function LinksPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch(`${API}/campaigns/all-links/agency`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (type, token, campaignId) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${type}/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(`${campaignId}-${type}`);
    toast.success("Lien copié !");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="links-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Liens d'accès</h1>
        <p className="text-white/50">Partagez ces liens pour inviter des participants</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="skeleton h-6 w-1/3 rounded mb-4" />
                <div className="skeleton h-4 w-full rounded mb-2" />
                <div className="skeleton h-4 w-full rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">Aucune campagne créée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {campaigns.map((campaign) => (
            <Card key={campaign.campaign_id} data-campaign-id={campaign.campaign_id} data-campaign-name={campaign.name} className="bg-[#121212] border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Video className="w-5 h-5 text-[#FF007F]" />
                  {campaign.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { type: "clipper", token: campaign.token_clipper, icon: Video, label: "Lien Clippeur", color: "#00E5FF" },
                  { type: "manager", token: campaign.token_manager, icon: Users, label: "Lien Manager", color: "#39FF14" },
                  { type: "client", token: campaign.token_client, icon: Eye, label: "Lien Client", color: "#FFB300" },
                ].map(({ type, token, icon: Icon, label, color }) => (
                  <div
                    key={type}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" style={{ color }} />
                      <span className="text-white/70">{label}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(type, token, campaign.campaign_id)}
                      className="text-white/50 hover:text-white"
                      data-testid={`copy-${type}-link-${campaign.campaign_id}`}
                    >
                      {copiedId === `${campaign.campaign_id}-${type}` ? (
                        <Check className="w-4 h-4 text-[#39FF14]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span className="ml-2">Copier</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Payment Page
function PaymentPage() {
  const [owedData, setOwedData] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchOwed(); }, []);

  const fetchOwed = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/payments/owed`, { credentials: "include" });
      if (res.ok) setOwedData(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  const handleConfirm = async (row) => {
    setConfirming(`${row.user_id}_${row.campaign_id}`);
    try {
      const res = await fetch(`${API}/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: row.user_id, campaign_id: row.campaign_id, amount: row.owed }),
      });
      if (res.ok) {
        toast.success(`Paiement de €${row.owed.toFixed(2)} confirmé ✓`);
        fetchOwed();
      } else toast.error("Erreur");
    } catch { toast.error("Erreur de connexion"); }
    finally { setConfirming(null); }
  };

  const fmt = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n||0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8" data-testid="agency-payment-page">
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Portefeuille</h1>
        <p className="text-white/50">Ce que vous devez à vos clippeurs — virements directs hors plateforme</p>
      </div>

      {/* Total owed banner */}
      {!loading && owedData && (
        <Card className="bg-[#121212] border-[#f0c040]/30">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50 mb-1">Total dû à tous les clippeurs</p>
              <p className="font-mono font-black text-4xl text-[#f0c040]">€{owedData.total_owed?.toFixed(2)}</p>
            </div>
            <DollarSign className="w-12 h-12 text-[#f0c040]/20" />
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Détail par clippeur / campagne</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 bg-white/5 rounded animate-pulse"/>)}</div>
          ) : !owedData?.rows?.length ? (
            <p className="text-white/40 text-center py-12">Aucun clippeur avec des gains</p>
          ) : (
            <div className="space-y-2">
              {owedData.rows.map((row) => {
                const key = `${row.user_id}_${row.campaign_id}`;
                return (
                  <div key={key} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/8 transition-colors">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                      {row.picture ? <img src={row.picture} alt="" className="w-full h-full object-cover"/> : <User className="w-5 h-5 text-[#00E5FF]"/>}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{row.display_name || row.name}</p>
                      <p className="text-xs text-white/40 truncate">{row.campaign_name}</p>
                      {row.payment_info && (
                        <p className="text-xs text-[#f0c040] flex items-center gap-1 mt-0.5">
                          <CreditCard className="w-3 h-3"/>{row.payment_info}
                        </p>
                      )}
                    </div>
                    {/* Stats */}
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-xs text-white/40">{fmt(row.views)} vues · €{row.earned.toFixed(2)} générés</p>
                      <p className={`font-mono font-bold text-base ${row.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                        {row.owed > 0 ? `À payer : €${row.owed.toFixed(2)}` : "✓ À jour"}
                      </p>
                      {!row.payment_info && row.owed > 0 && (
                        <p className="text-xs text-white/30 italic">En attente de coordonnées</p>
                      )}
                    </div>
                    {/* Action */}
                    {row.owed > 0 && (
                      <button
                        onClick={() => handleConfirm(row)}
                        disabled={confirming === key}
                        className="ml-2 px-3 py-2 rounded-lg bg-[#f0c040]/20 hover:bg-[#f0c040]/30 border border-[#f0c040]/40 text-[#f0c040] text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                      >
                        {confirming === key ? "..." : "Marquer payé"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique confirmations */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader><CardTitle className="text-white text-base">Historique des virements confirmés</CardTitle></CardHeader>
        <CardContent>
          {!owedData ? null : owedData.rows.filter(r => r.last_payment).length === 0 ? (
            <p className="text-white/40 text-sm text-center py-6">Aucun virement confirmé</p>
          ) : (
            <div className="space-y-2">
              {owedData.rows.filter(r => r.last_payment).map((row) => (
                <div key={`hist_${row.user_id}_${row.campaign_id}`} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white text-sm">{row.display_name || row.name} — {row.campaign_name}</p>
                    <p className="text-white/40 text-xs">{new Date(row.last_payment.confirmed_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <p className="font-mono font-bold text-[#39FF14]">€{row.last_payment.amount_eur?.toFixed(2)}</p>
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
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [strikeThreshold, setStrikeThreshold] = useState("3");
  const [picturePreview, setPicturePreview] = useState(user?.picture || null);
  const [pictureBase64, setPictureBase64] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handlePicture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setPicturePreview(ev.target.result); setPictureBase64(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const profileBody = { display_name: displayName };
      if (pictureBase64) profileBody.picture = pictureBase64;
      await Promise.all([
        fetch(`${API}/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(profileBody),
        }),
        fetch(`${API}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ strike_threshold: parseInt(strikeThreshold) }),
        }),
      ]);
      toast.success("Paramètres sauvegardés");
    } catch (error) {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-settings-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paramètres</h1>
        <p className="text-white/50">Configurez votre agence</p>
      </div>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Profil de l'agence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Photo de profil */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10">
              {picturePreview
                ? <img src={picturePreview} alt="" className="w-full h-full object-cover" />
                : <span className="text-white/40 font-bold text-2xl">{displayName?.[0] || "A"}</span>}
            </div>
            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 transition-colors">
                <Plus className="w-4 h-4" />
                {picturePreview ? "Changer la photo" : "Ajouter une photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handlePicture} />
              </label>
              <p className="text-xs text-white/30 mt-1">JPG, PNG — max 5 Mo</p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-2">Nom de l'agence</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Email (Google)</label>
            <Input value={user?.email || ""} disabled className="bg-white/5 border-white/10 text-white/50" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Règles de strikes</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Nombre de strikes avant suspension
            </label>
            <Input
              type="number"
              value={strikeThreshold}
              onChange={(e) => setStrikeThreshold(e.target.value)}
              className="bg-white/5 border-white/10 text-white w-24"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
        >
          {isSaving ? "Enregistrement..." : "Enregistrer"}
        </Button>
        <Button
          variant="outline"
          onClick={logout}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          Se déconnecter
        </Button>
      </div>
    </motion.div>
  );
}
