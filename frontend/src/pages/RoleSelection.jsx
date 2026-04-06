import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { motion } from "framer-motion";
import { Video, Building2, Users, Eye, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";

const roles = [
  {
    id: "clipper",
    title: "Clippeur",
    icon: Video,
    color: "#00E5FF",
    description: "Je crée des clips et je veux être rémunéré selon mes vues",
    placeholder: "Votre pseudo de clippeur",
  },
  {
    id: "agency",
    title: "Agence",
    icon: Building2,
    color: "#FF007F",
    description: "Je gère des campagnes de clipping et des équipes de clippeurs",
    placeholder: "Nom de votre agence",
  },
  {
    id: "manager",
    title: "Manager",
    icon: Users,
    color: "#39FF14",
    description: "Je supervise des clippeurs et je donne des conseils",
    placeholder: "Votre nom",
  },
  {
    id: "client",
    title: "Client",
    icon: Eye,
    color: "#FFB300",
    description: "Je suis créateur/influenceur et je veux suivre mes campagnes",
    placeholder: "Votre nom",
  },
];

export default function RoleSelection() {
  const navigate = useNavigate();
  const { user, selectRole } = useAuth();
  const [selectedRole, setSelectedRole] = useState(null);
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedRole || !displayName.trim()) {
      toast.error("Veuillez sélectionner un rôle et entrer un nom");
      return;
    }

    setIsSubmitting(true);
    const updatedUser = await selectRole(selectedRole, displayName.trim());
    setIsSubmitting(false);

    if (updatedUser) {
      navigate(`/${selectedRole}`);
    }
  };

  const selectedRoleData = roles.find((r) => r.id === selectedRole);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="font-display font-bold text-3xl text-white mb-3">
            Choisissez votre rôle
          </h1>
          <p className="text-white/50">
            Bienvenue {user?.name} ! Sélectionnez comment vous souhaitez utiliser la plateforme.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {roles.map((role, index) => (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => setSelectedRole(role.id)}
              data-testid={`role-${role.id}-btn`}
              className={`relative p-6 rounded-xl border text-left transition-colors duration-200 ${
                selectedRole === role.id
                  ? "bg-white/5 border-white/20"
                  : "bg-[#121212] border-white/5 hover:border-white/10"
              }`}
              style={{
                borderColor: selectedRole === role.id ? role.color : undefined,
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                style={{ backgroundColor: `${role.color}20` }}
              >
                <role.icon className="w-6 h-6" style={{ color: role.color }} />
              </div>
              <h3 className="font-display font-bold text-lg text-white mb-2">
                {role.title}
              </h3>
              <p className="text-sm text-white/50 leading-relaxed">
                {role.description}
              </p>
              {selectedRole === role.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: role.color }}
                >
                  <ChevronRight className="w-4 h-4 text-black" />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>

        {selectedRole && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121212] border border-white/10 rounded-xl p-6"
          >
            <label className="block text-sm text-white/70 mb-2">
              {selectedRoleData?.placeholder}
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={selectedRoleData?.placeholder}
              data-testid="display-name-input"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 mb-4"
            />
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !displayName.trim()}
              data-testid="confirm-role-btn"
              className="w-full font-bold rounded-lg py-6 transition-colors duration-200"
              style={{
                backgroundColor: selectedRoleData?.color,
                color: "#000",
              }}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Confirmation...
                </span>
              ) : (
                "Confirmer"
              )}
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
