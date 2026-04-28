import { useState, useEffect } from "react";
import { API } from "../App";
import { toast } from "sonner";
import { RefreshCw, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

/**
 * Panel de statut de scraping pour une campagne.
 * Affiche : horaires planifiés, prochain scrape, statut par compte.
 * Bouton force-scrape : visible uniquement si canForceScrape=true (admin).
 * Visible : agence + manager (lecture) + admin (lecture + force).
 */
export default function ScrapeStatusPanel({ campaignId, onScrapeComplete, canForceScrape = false }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/scrape-status`, { credentials: "include" });
      if (res.ok) setStatus(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!campaignId) return;
    fetchStatus();
    // Refresh status toutes les 30s
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const handleForceScrape = async () => {
    if (scraping) return;
    if (!window.confirm("Lancer le scraping de tous les comptes maintenant ? Ça peut prendre 30s à 2 min.")) return;
    setScraping(true);
    setScrapeResult(null);
    setExpanded(true);  // Ouvre auto les détails pour voir le résultat
    toast.info("Scraping en cours… ça peut prendre 30s à 2 min selon le nombre de comptes");
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/force-scrape`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setScrapeResult(data);
        const ins = data.total_videos_inserted || 0;
        const errs = data.total_errors || 0;
        const skipped = data.total_skipped_pre_cutoff || 0;
        if (ins === 0 && errs > 0) {
          toast.error(`Scraping : 0 vidéos insérées · ${errs} erreurs — voir le détail par compte ci-dessous`, { duration: 10000 });
        } else if (ins === 0 && skipped > 0) {
          toast.warning(`Scraping : ${data.total_videos_fetched} vidéos trouvées mais TOUTES avant ${data.tracking_start_date_human} (cutoff) — recule la date dans Paramètres`, { duration: 12000 });
        } else if (ins === 0) {
          toast.warning(`Scraping : 0 vidéos trouvées — vérifie que les comptes sont vérifiés et publient des vidéos`, { duration: 8000 });
        } else {
          toast.success(`✓ Scraping : ${ins} vidéos insérées${errs > 0 ? ` (${errs} comptes en erreur)` : ""}`);
        }
        fetchStatus();
        onScrapeComplete?.();
      } else {
        toast.error(data.detail || "Erreur lors du scraping");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setScraping(false);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const diffMin = Math.round((d - new Date()) / 60000);
    if (Math.abs(diffMin) < 60) {
      return diffMin > 0 ? `dans ${diffMin}min` : `il y a ${-diffMin}min`;
    }
    const diffH = Math.round(diffMin / 60);
    return diffMin > 0 ? `dans ${diffH}h` : `il y a ${-diffH}h`;
  };

  if (loading || !status) {
    return (
      <div className="bg-[#121212] border border-white/10 rounded-xl p-3 flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
        <p className="text-white/40 text-xs">Chargement statut scraping…</p>
      </div>
    );
  }

  const accounts = status.accounts || [];
  const accountsWithErrors = accounts.filter(a => a.status === "error" || a.last_scrape_error);
  const verifiedAccounts = accounts.filter(a => a.status === "verified");
  const totalVideos = accounts.reduce((s, a) => s + (a.videos_tracked || 0), 0);

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-4 space-y-3">
      {/* Header compact */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#00E5FF]" />
          <p className="text-white/80 text-sm font-medium">Scraping automatique</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-white/40 hover:text-white text-xs px-2 py-1 rounded-md hover:bg-white/5 transition-all">
            {expanded ? "Masquer détails" : "Voir détails"}
          </button>
          {canForceScrape && (
            <button
              onClick={handleForceScrape}
              disabled={scraping || accounts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all">
              {scraping
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scraping…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Lancer scrape (admin)</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Stats résumées */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="bg-white/5 rounded-lg p-2.5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Horaires (Paris)</p>
          <p className="text-white font-mono text-xs mt-0.5">{(status.scrape_schedule_paris || []).join(" · ")}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-2.5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Prochain scrape</p>
          <p className="text-[#00E5FF] font-mono text-xs mt-0.5">{status.next_auto_scrape_paris} ({formatTime(status.next_auto_scrape_utc)})</p>
        </div>
        <div className="bg-white/5 rounded-lg p-2.5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Comptes</p>
          <p className="text-white font-mono text-xs mt-0.5">
            {verifiedAccounts.length}/{accounts.length} vérifiés
            {accountsWithErrors.length > 0 && <span className="text-red-400 ml-1">· {accountsWithErrors.length} en erreur</span>}
          </p>
        </div>
        <div className="bg-white/5 rounded-lg p-2.5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Vidéos trackées</p>
          <p className="text-[#39FF14] font-mono text-xs mt-0.5">{totalVideos}</p>
        </div>
      </div>

      {/* Résultat dernier force-scrape — résumé global */}
      {scrapeResult && (() => {
        const ins = scrapeResult.total_videos_inserted || 0;
        const errs = scrapeResult.total_errors || 0;
        const fetched = scrapeResult.total_videos_fetched || 0;
        const skipped = scrapeResult.total_skipped_pre_cutoff || 0;
        const isOK = ins > 0 && errs === 0;
        const isProblematic = ins === 0;
        return (
          <div className={`border rounded-lg p-3 text-xs space-y-2 ${
            isOK ? "bg-[#39FF14]/5 border-[#39FF14]/20" :
            isProblematic ? "bg-red-500/5 border-red-500/30" :
            "bg-amber-500/5 border-amber-500/30"
          }`}>
            <p className={`font-bold ${isOK ? "text-[#39FF14]" : isProblematic ? "text-red-400" : "text-amber-400"}`}>
              {isOK ? "✓" : isProblematic ? "⚠" : "⚠"} Dernier scraping
            </p>
            <p className="text-white/70">
              {scrapeResult.accounts_scraped} comptes · <strong>{ins}</strong> vidéos insérées · {fetched} trouvées au total · {skipped} avant cutoff · {errs} erreurs · fenêtre {scrapeResult.since_days}j
            </p>
            {skipped > 0 && ins === 0 && (
              <p className="text-amber-300 text-[11px]">
                ⚠️ {fetched} vidéos trouvées mais TOUTES publiées avant {scrapeResult.tracking_start_date_human || "la date de cutoff"}.
                Recule <strong>tracking_start_date</strong> dans Paramètres pour les inclure.
              </p>
            )}
            {/* Détail par compte du dernier scrape */}
            {scrapeResult.results && scrapeResult.results.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-white/10">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Détail par compte</p>
                {scrapeResult.results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded text-[11px] ${
                    r.ok && r.inserted > 0 ? "bg-[#39FF14]/5" :
                    r.ok && r.inserted === 0 ? "bg-amber-500/5" :
                    "bg-red-500/5"
                  }`}>
                    <span className="flex-shrink-0">
                      {r.ok && r.inserted > 0 ? "✓" : r.ok ? "⚠" : "✗"}
                    </span>
                    <span className="text-white/80 flex-shrink-0 font-medium">
                      {r.platform === "tiktok" ? "🎵" : r.platform === "instagram" ? "📸" : "▶️"} @{r.username}
                    </span>
                    <span className="text-white/50 flex-1">
                      {r.ok ? (
                        <>
                          {r.inserted} insérées · {r.fetched} trouvées · {r.skipped_pre_cutoff || 0} pré-cutoff
                          {r.warning && <span className="text-amber-400 block mt-0.5">{r.warning}</span>}
                        </>
                      ) : (
                        <span className="text-red-300">{r.error || "erreur inconnue"}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Détails par compte */}
      {expanded && accounts.length > 0 && (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Détail par compte</p>
          {accounts.map(acc => {
            const isError = acc.status === "error" || acc.last_scrape_error;
            const isVerified = acc.status === "verified";
            const isPending = acc.status === "pending";
            return (
              <div key={acc.account_id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                  isError ? "bg-red-500/5 border border-red-500/20" :
                  isPending ? "bg-amber-500/5 border border-amber-500/20" :
                  "bg-white/3 border border-white/8"
                }`}>
                {isVerified && <CheckCircle className="w-3 h-3 text-[#39FF14] flex-shrink-0" />}
                {isError && <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                {isPending && <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />}
                <span className="text-white/70 font-medium truncate">{acc.platform === "tiktok" ? "🎵" : acc.platform === "instagram" ? "📸" : "▶️"} @{acc.username}</span>
                <span className="text-white/40 ml-auto flex-shrink-0">
                  {acc.videos_tracked || 0} vidéos
                </span>
                {acc.last_tracked_at && (
                  <span className="text-white/30 flex-shrink-0">{formatTime(acc.last_tracked_at)}</span>
                )}
                {isError && (acc.error_message || acc.last_scrape_error) && (
                  <span className="text-red-400 text-[10px] flex-shrink-0 max-w-[200px] truncate" title={acc.error_message || acc.last_scrape_error}>
                    {(acc.error_message || acc.last_scrape_error || "").slice(0, 40)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {accounts.length === 0 && (
        <p className="text-white/30 text-xs italic">Aucun compte assigné à cette campagne</p>
      )}
    </div>
  );
}
