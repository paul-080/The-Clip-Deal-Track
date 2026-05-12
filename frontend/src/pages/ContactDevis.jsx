import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API } from "../App";
import { toast } from "sonner";
import { ArrowLeft, Send, CheckCircle2, Building2, Mail, Phone, User as UserIcon, MessageSquare } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";

export default function ContactDevis() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: "",
  });

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();
    if (!name || !email || !message) {
      toast.error("Nom, email et message sont obligatoires");
      return;
    }
    if (!email.includes("@") || !email.split("@")[1]?.includes(".")) {
      toast.error("Email invalide");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/contact/devis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company: form.company.trim() || null,
          phone: form.phone.trim() || null,
          message,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Erreur ${res.status}`);
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || "Erreur lors de l'envoi. Réessayez plus tard.");
    } finally {
      setSubmitting(false);
    }
  };

  // Page de confirmation après envoi
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/40">
            <CheckCircle2 className="w-10 h-10 text-[#00E5FF]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-3">Demande envoyée</h1>
            <p className="text-white/60 text-base leading-relaxed">
              Merci pour votre intérêt. Notre équipe vous recontactera sous 24h ouvrées
              à l'adresse <span className="text-white font-medium">{form.email}</span>.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={() => navigate("/")}
              className="w-full bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
            >
              Retour à l'accueil
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-6 lg:px-16 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Link>
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-[#00E5FF] to-[#FF007F] rounded-md px-3 py-1">
              <span className="text-black font-bold text-sm">▶ The Clip Deal Track</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/40 mb-5">
            <Building2 className="w-7 h-7 text-[#00E5FF]" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-3">Devis Enterprise</h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            Parlez-nous de votre projet — on revient vers vous avec une offre sur mesure sous 24h.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#121212] border border-white/10 rounded-2xl p-6 lg:p-8 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[#00E5FF]" /> Nom complet *
              </label>
              <Input
                type="text"
                value={form.name}
                onChange={update("name")}
                placeholder="Jean Dupont"
                required
                maxLength={200}
                className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#00E5FF]" /> Email *
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="jean@entreprise.com"
                required
                maxLength={200}
                className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#00E5FF]" /> Entreprise
              </label>
              <Input
                type="text"
                value={form.company}
                onChange={update("company")}
                placeholder="Nom de votre entreprise"
                maxLength={200}
                className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#00E5FF]" /> Téléphone
              </label>
              <Input
                type="tel"
                value={form.phone}
                onChange={update("phone")}
                placeholder="+33 6 12 34 56 78"
                maxLength={50}
                className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#00E5FF]" /> Votre besoin *
            </label>
            <Textarea
              value={form.message}
              onChange={update("message")}
              placeholder="Décrivez votre projet : nombre de clippeurs, plateformes, budget, délais, intégrations souhaitées…"
              required
              rows={6}
              maxLength={5000}
              className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/30 resize-none"
            />
            <p className="text-xs text-white/30 mt-1">{form.message.length} / 5000</p>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#00E5FF] hover:bg-[#00E5FF]/80 text-black font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>Envoi en cours…</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Envoyer ma demande
              </>
            )}
          </Button>

          <p className="text-xs text-white/40 text-center">
            En envoyant ce formulaire, vous acceptez d'être recontacté par notre équipe par email.
          </p>
        </form>
      </div>
    </div>
  );
}
