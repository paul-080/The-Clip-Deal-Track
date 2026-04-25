import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ThumbsUp, ThumbsDown, MessageCircle, Share2, Plus, X,
  BarChart2, Check, Link2, ChevronRight, Video
} from "lucide-react";
import { API } from "../App";

// ── Post Card (annonce avec like/dislike/commentaires/photo) ──────────────────
export function PostCard({ ann, currentUser }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(ann.likes || 0);
  const [disliked, setDisliked] = useState(false);
  const [dislikeCount, setDislikeCount] = useState(ann.dislikes || 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingCmts, setLoadingCmts] = useState(false);
  const [sending, setSending] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  useEffect(() => {
    fetch(`${API}/announcements/${ann.announcement_id}/likes`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setLiked(d.liked);
          setLikeCount(d.count);
          setDisliked(d.disliked || false);
          setDislikeCount(d.dislike_count || 0);
        }
      })
      .catch(() => {});
  }, [ann.announcement_id]);

  const toggleLike = async () => {
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/like`, { method: "POST", credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setLiked(d.liked); setLikeCount(d.count);
        setDisliked(d.disliked || false); setDislikeCount(d.dislike_count || 0);
      }
    } catch {}
  };

  const toggleDislike = async () => {
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/dislike`, { method: "POST", credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setDisliked(d.disliked); setDislikeCount(d.dislike_count);
        setLiked(d.liked || false); setLikeCount(d.count || 0);
      }
    } catch {}
  };

  const loadComments = async () => {
    setLoadingCmts(true);
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/comments`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setComments(d.comments || []); }
    } catch {}
    setLoadingCmts(false);
  };

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) loadComments();
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (r.ok) {
        const c = await r.json();
        setComments(prev => [...prev, c]);
        setCommentText("");
      }
    } catch {}
    setSending(false);
  };

  const lines = (ann.content || "").split("\n");
  const isLong = lines.length > 5;
  const displayLines = isLong && !contentExpanded ? lines.slice(0, 4) : lines;
  const imageUrl = ann.image_url || ann.image;

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl px-5 py-5">
      {/* Catégorie */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-5 h-5 rounded bg-[#FF007F]/20 flex items-center justify-center">
          <BarChart2 className="w-3 h-3 text-[#FF007F]" />
        </span>
        <span className="text-xs text-white/40 uppercase tracking-wide font-medium">
          Campagnes {ann.campaign_name ? `• ${ann.campaign_name}` : ""}
        </span>
      </div>

      {/* Auteur */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {ann.agency?.picture
              ? <img src={ann.agency.picture} alt="" className="w-full h-full object-cover" />
              : <span className="text-[#FF007F] font-bold text-sm">{ann.agency?.display_name?.[0] || "A"}</span>}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white text-sm">{ann.agency?.display_name || "Agence"}</span>
              <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white/50" />
              </span>
            </div>
            <p className="text-xs text-white/40">{formatDate(ann.created_at)}</p>
          </div>
        </div>
        <button className="text-white/20 hover:text-white/50 transition-colors" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Lien copié"); }}>
          <Link2 className="w-4 h-4" />
        </button>
      </div>

      {/* Titre */}
      {ann.title && <p className="font-semibold text-white mb-2">{ann.title}</p>}

      {/* Contenu */}
      <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line mb-3">
        {displayLines.join("\n")}
        {isLong && !contentExpanded && (
          <button onClick={() => setContentExpanded(true)} className="ml-1 text-[#00E5FF] hover:underline text-xs">voir plus</button>
        )}
      </div>

      {/* Image */}
      {imageUrl && (
        <div className="rounded-xl overflow-hidden mb-4 border border-white/10">
          <img src={imageUrl} alt="" className="w-full object-cover max-h-80" />
        </div>
      )}

      {/* Engagement bar */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-4">
          <button onClick={toggleLike}
            className={`flex items-center gap-1.5 text-sm transition-colors ${liked ? "text-[#FF007F]" : "text-white/40 hover:text-white/70"}`}>
            <ThumbsUp className={`w-4 h-4 transition-all ${liked ? "fill-[#FF007F] scale-110" : ""}`} />
            <span>{likeCount > 0 ? likeCount : ""}</span>
          </button>
          <button onClick={toggleDislike}
            className={`flex items-center gap-1.5 text-sm transition-colors ${disliked ? "text-white" : "text-white/40 hover:text-white/70"}`}>
            <ThumbsDown className={`w-4 h-4 transition-all ${disliked ? "fill-white scale-110" : ""}`} />
            <span>{dislikeCount > 0 ? dislikeCount : ""}</span>
          </button>
          <button onClick={toggleComments}
            className={`flex items-center gap-1.5 text-sm transition-colors ${commentsOpen ? "text-[#00E5FF]" : "text-white/40 hover:text-white/70"}`}>
            <MessageCircle className="w-4 h-4" />
            <span>{comments.length || ""} commentaire{comments.length !== 1 ? "s" : ""}</span>
          </button>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
          <Share2 className="w-4 h-4" /> Partager
        </button>
      </div>

      {/* Commentaires */}
      {commentsOpen && (
        <div className="mt-4 space-y-3">
          {loadingCmts ? (
            <p className="text-xs text-white/30 text-center py-2">Chargement…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-2">Soyez le premier à commenter</p>
          ) : (
            comments.map((c) => (
              <div key={c.comment_id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {c.author?.picture
                    ? <img src={c.author.picture} alt="" className="w-full h-full object-cover" />
                    : <span className="text-white/60 text-xs font-bold">{c.author?.display_name?.[0] || "?"}</span>}
                </div>
                <div className="flex-1 bg-white/5 rounded-2xl px-3 py-2">
                  <p className="text-xs font-semibold text-white/80 mb-0.5">{c.author?.display_name || "Utilisateur"}</p>
                  <p className="text-sm text-white/70 leading-snug">{c.content}</p>
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-7 h-7 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {currentUser?.picture
                ? <img src={currentUser.picture} alt="" className="w-full h-full object-cover" />
                : <span className="text-[#FF007F] text-xs font-bold">{currentUser?.display_name?.[0] || "?"}</span>}
            </div>
            <div className="flex-1 flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/5 focus-within:border-white/20 transition-colors">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendComment()}
                placeholder="Écrire un commentaire…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
              <button onClick={sendComment} disabled={sending || !commentText.trim()}
                className="text-white/30 hover:text-[#00E5FF] disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Post Composer (agence/manager seulement) ──────────────────────────────────
export function PostComposer({ user, onPosted }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setImagePreview(ev.target.result); setImageBase64(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!title.trim() && !content.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: title.trim(), content: content.trim(), image_url: imageBase64 }),
      });
      if (r.ok) {
        toast.success("Annonce publiée !");
        setTitle(""); setContent(""); setImagePreview(null); setImageBase64(null); setOpen(false);
        if (onPosted) onPosted();
      } else {
        const err = await r.json();
        toast.error(err.detail || "Erreur");
      }
    } catch { toast.error("Erreur de connexion"); }
    setSubmitting(false);
  };

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl">
      {!open ? (
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover rounded-full" /> : <span className="text-[#FF007F] font-bold text-sm">{user?.display_name?.[0] || "A"}</span>}
          </div>
          <button onClick={() => setOpen(true)}
            className="flex-1 text-left bg-white/5 rounded-full px-4 py-2 text-sm text-white/30 hover:bg-white/10 transition-colors">
            Publier une annonce campagne…
          </button>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover rounded-full" /> : <span className="text-[#FF007F] font-bold text-sm">{user?.display_name?.[0] || "A"}</span>}
            </div>
            <span className="font-semibold text-white text-sm">{user?.display_name}</span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de l'annonce…"
            className="w-full bg-transparent text-white font-semibold text-base placeholder:text-white/30 outline-none border-b border-white/10 pb-2"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Décris ta campagne, tarif, plateformes…"
            rows={4}
            className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/30 outline-none resize-none leading-relaxed"
          />
          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src={imagePreview} alt="" className="w-full max-h-60 object-cover" />
              <button onClick={() => { setImagePreview(null); setImageBase64(null); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <label className="flex items-center gap-2 text-white/40 hover:text-white/70 cursor-pointer transition-colors text-sm">
              <Plus className="w-4 h-4" />
              <span>Ajouter une photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setOpen(false); setTitle(""); setContent(""); setImagePreview(null); setImageBase64(null); }}
                className="px-4 py-1.5 text-sm text-white/40 hover:text-white transition-colors">Annuler</button>
              <button onClick={handleSubmit} disabled={submitting || (!title.trim() && !content.trim())}
                className="px-4 py-1.5 text-sm font-medium bg-[#FF007F] text-white rounded-lg hover:bg-[#FF007F]/80 disabled:opacity-40 transition-colors">
                {submitting ? "Publication…" : "Publier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
