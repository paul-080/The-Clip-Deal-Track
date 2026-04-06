import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import { motion } from "framer-motion";
import { Video, Check, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";

export default function JoinCampaign() {
  const { role, token } = useParams();
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      joinCampaign();
    } else {
      setLoading(false);
    }
  }, [user, token]);

  const joinCampaign = async () => {
    setJoining(true);
    try {
      const res = await fetch(`${API}/campaigns/join/${token}`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign);
        setSuccess(true);
        toast.success("Vous avez rejoint la campagne !");
        
        // Redirect after delay
        setTimeout(() => {
          navigate(`/${role}/campaign/${data.campaign.campaign_id}`);
        }, 2000);
      } else {
        const errData = await res.json();
        setError(errData.detail || "Erreur lors de la connexion");
      }
    } catch (err) {
      setError("Erreur de connexion au serveur");
    } finally {
      setJoining(false);
      setLoading(false);
    }
  };

  const handleLogin = () => {
    // Store the join URL to redirect after login
    sessionStorage.setItem("pendingJoin", window.location.pathname);
    login();
  };

  const roleColors = {
    clipper: "#00E5FF",
    manager: "#39FF14",
    client: "#FFB300",
  };

  const roleNames = {
    clipper: "Clippeur",
    manager: "Manager",
    client: "Client",
  };

  const accentColor = roleColors[role] || "#00E5FF";

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8">
            {loading || joining ? (
              <div className="text-center">
                <div 
                  className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                  style={{ borderColor: accentColor, borderTopColor: 'transparent' }}
                />
                <p className="text-white/60">
                  {joining ? "Connexion à la campagne..." : "Chargement..."}
                </p>
              </div>
            ) : success ? (
              <div className="text-center">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: `${accentColor}20` }}
                >
                  <Check className="w-8 h-8" style={{ color: accentColor }} />
                </div>
                <h2 className="font-display font-bold text-2xl text-white mb-2">
                  Bienvenue !
                </h2>
                <p className="text-white/60 mb-4">
                  Vous avez rejoint la campagne
                  <br />
                  <span className="font-bold text-white">{campaign?.name}</span>
                </p>
                <p className="text-sm text-white/40">Redirection en cours...</p>
              </div>
            ) : error ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="font-display font-bold text-2xl text-white mb-2">
                  Erreur
                </h2>
                <p className="text-white/60 mb-6">{error}</p>
                <Button
                  onClick={() => navigate("/")}
                  variant="outline"
                  className="border-white/20 text-white"
                >
                  Retour à l'accueil
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: `${accentColor}20` }}
                >
                  <Video className="w-8 h-8" style={{ color: accentColor }} />
                </div>
                <h2 className="font-display font-bold text-2xl text-white mb-2">
                  Rejoindre en tant que {roleNames[role]}
                </h2>
                <p className="text-white/60 mb-6">
                  Connectez-vous avec Google pour rejoindre cette campagne
                </p>
                <Button
                  onClick={handleLogin}
                  className="w-full py-6 text-lg font-bold"
                  style={{ backgroundColor: accentColor, color: "#000" }}
                  data-testid="join-login-btn"
                >
                  Se connecter avec Google
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
