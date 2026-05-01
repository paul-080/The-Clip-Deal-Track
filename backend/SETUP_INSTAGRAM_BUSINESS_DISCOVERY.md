# Setup Instagram Business Discovery (vraies vues 100% gratuit)

## Pourquoi

L'app Instagram affiche un compteur "Views" qui = vues IG + vues Facebook cross-post combinees (ex: 92k au lieu de 54k que l'API privee renvoie). Ce compteur unifie n'est accessible **QUE via l'API officielle Meta Graph**.

Bonne nouvelle : tu n'as PAS besoin que tes clippeurs fassent OAuth. Il te faut juste **UN compte Insta Business** que tu connectes UNE FOIS, et tu peux ensuite query n'importe quel compte business public.

## Etape 1 : Convertir ton compte Insta en compte Business (5 min)

1. Sur l'app Insta : Profil > Menu (≡) > Parametres
2. Centre de comptes > Type de compte > Passer en compte professionnel
3. Choisis "Createur" ou "Entreprise" (peu importe pour l'API)
4. **Important** : connecte-le a une Page Facebook (obligatoire pour Graph API)
   - Centre de comptes > Comptes connectes > Facebook > Lier

Si tu n'as pas de Page FB, cree-en une : facebook.com > Pages > Creer une Page

## Etape 2 : Creer une App Meta Developer (10 min)

1. Va sur https://developers.facebook.com
2. Connecte-toi avec ton compte Facebook (le meme que celui lie a Insta)
3. Mes Apps > Creer une App
4. Type : **Business**
5. Nom : "ClipDealTrack" (ou ce que tu veux)
6. Email : ton email
7. Cree

## Etape 3 : Ajouter le produit Instagram Graph API

1. Dans le tableau de bord de ton App > **Ajouter des produits**
2. Cherche "Instagram Graph API" > **Configurer**
3. Tu verras un panneau avec les permissions

## Etape 4 : Generer un User Access Token (15 min)

1. Va sur https://developers.facebook.com/tools/explorer/
2. En haut a droite, selectionne ton App "ClipDealTrack"
3. **Get Token** (bouton bleu) > **Get User Access Token**
4. Coche ces permissions :
   - `instagram_basic`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
5. Clique **Generate Access Token**
6. Tu obtiens un short-lived token (~1 heure de validite)

## Etape 5 : Convertir en Long-Lived Token (60 jours)

Dans le terminal :
```bash
curl "https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN"
```

- `APP_ID` : tableau de bord App > Parametres > Basique > ID de l'App
- `APP_SECRET` : meme page > Cle secrete (clique pour reveler)
- `SHORT_LIVED_TOKEN` : celui de l'etape 4

Tu obtiens : `{"access_token":"EAxxxxx","token_type":"bearer","expires_in":5184000}`

C'est ton **IG_LONG_LIVED_TOKEN** (60 jours).

## Etape 6 : Recuperer ton IG_BUSINESS_ACCOUNT_ID

```bash
# 1. Lister tes Pages FB
curl "https://graph.facebook.com/v22.0/me/accounts?access_token=IG_LONG_LIVED_TOKEN"
# Tu obtiens un id de Page (ex: "id": "1234567890")

# 2. Recuperer l'IG Business Account Id lie a cette Page
curl "https://graph.facebook.com/v22.0/PAGE_ID?fields=instagram_business_account&access_token=IG_LONG_LIVED_TOKEN"
# Tu obtiens : "instagram_business_account": {"id": "17841400000000000"}
```

C'est ton **IG_BUSINESS_ACCOUNT_ID**.

## Etape 7 : Configurer Railway

Sur Railway > Variables :
```
IG_BUSINESS_ACCOUNT_ID = 17841400000000000
IG_LONG_LIVED_TOKEN = EAxxxxxxx
```

Save > Railway redeploie auto.

## Etape 8 : Tester

Sur ton interface, ajoute la video `https://www.instagram.com/p/DVju4UNCle9/`. Tu dois maintenant voir **les vraies vues unifiees** (le 92k que l'app Insta affiche).

Dans les logs Railway, cherche :
```
BusinessDiscovery SUCCESS for DVju4UNCle9: views=92000 (UNIFIE IG+FB)
```

## Auto-refresh du token (CRITIQUE)

Le token expire dans 60 jours. Pour eviter qu'il expire :

1. Mets dans ton calendrier un rappel **tous les 50 jours**
2. Re-genere via l'etape 4-5
3. Mets a jour `IG_LONG_LIVED_TOKEN` sur Railway

OU mieux : ajoute un cron Railway qui refresh auto (je peux te coder ca si tu veux).

## Limitations a savoir

- Compte cible doit etre **public Business/Creator** (la majorite des comptes que tes clippeurs ciblent)
- Si compte personnel prive : Business Discovery echoue, on tombe sur fallback (54k)
- 200 calls/heure en Standard Access (largement suffisant pour ton volume)
- Si scaling >200/h : demande Advanced Access via App Review Meta (~2 semaines)

## En cas de probleme

- Token invalide : verifie `IG_LONG_LIVED_TOKEN` sur Railway
- "Bad Request" : verifie `IG_BUSINESS_ACCOUNT_ID`
- "Permissions error" : re-genere le token avec les 4 scopes (etape 4)
- Compte pas trouve : le compte cible doit etre Business public, pas perso prive
