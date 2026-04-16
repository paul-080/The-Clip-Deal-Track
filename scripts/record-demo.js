/**
 * The Clip Deal — Demo Video Recorder (~90 secondes)
 * Présente toutes les fonctionnalités de A à Z automatiquement.
 *
 * Usage:
 *   node scripts/record-demo.js https://ton-app.railway.app
 *
 * Sortie : scripts/demo-output/demo.webm
 * Convertir en MP4 : ffmpeg -i demo.webm -c:v libx264 -crf 20 demo.mp4
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = (process.argv[2] || "http://localhost:3001").replace(/\/$/, "");
const OUTPUT_DIR = path.join(__dirname, "demo-output");

const AGENCY  = { email: "agency@clipdeal.com",  password: "demo1234" };
const CLIPPER = { email: "jean@clipdeal.com",     password: "demo1234" };

const w = (ms) => new Promise((r) => setTimeout(r, ms));

async function scroll(page, px) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), px);
  await w(500);
}

async function login(page, email, password) {
  // Aller sur la landing page
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await w(1000);
  // Cliquer sur "Se connecter" pour ouvrir la modal
  await page.locator('button:has-text("Se connecter")').first().click();
  await w(800);
  // Remplir le champ email dans la modal
  const em = page.locator('input[type="email"]').first();
  await em.waitFor({ timeout: 8000 });
  await em.fill(email);
  await w(300);
  // Remplir le mot de passe
  const pw = page.locator('input[type="password"]').first();
  await pw.fill(password);
  await w(400);
  // Soumettre — le bouton "Se connecter" dans la modal
  await page.locator('button:has-text("Se connecter")').last().click();
  await page.waitForURL((u) => u.includes("/agency") || u.includes("/clipper") || u.includes("/dashboard"), { timeout: 12000 }).catch(() => {});
  await w(1000);
}

async function clickTab(page, label) {
  const tab = page.locator(`button:has-text("${label}"), [role="tab"]:has-text("${label}")`).first();
  if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tab.click();
    await w(700);
  }
}

async function getCampaignId(page, role) {
  // Trouve le premier lien de campagne dans la sidebar
  const link = page.locator(`a[href*="/${role}/campaign/"]`).first();
  const href = await link.getAttribute("href").catch(() => null);
  if (!href) return null;
  const m = href.match(/\/campaign\/([^/]+)/);
  return m ? m[1] : null;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`\n🎬 Enregistrement démo — ${BASE_URL}\n`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 120,
    args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
    locale: "fr-FR",
  });

  const page = await context.newPage();

  try {
    // ──────────────────────────────────────────────────────
    // 1. LANDING PAGE  (~8s)
    // ──────────────────────────────────────────────────────
    console.log("1/10 Landing page");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await w(1800);
    await scroll(page, 450);
    await scroll(page, 450);
    await scroll(page, 500);
    await w(600);
    await scroll(page, -1400);
    await w(500);

    // ──────────────────────────────────────────────────────
    // 2. CONNEXION AGENCE  (~8s)
    // ──────────────────────────────────────────────────────
    console.log("2/10 Login agence");
    await login(page, AGENCY.email, AGENCY.password);

    // ──────────────────────────────────────────────────────
    // 3. DASHBOARD AGENCE — vue d'ensemble  (~7s)
    // ──────────────────────────────────────────────────────
    console.log("3/10 Dashboard agence");
    await page.goto(`${BASE_URL}/agency`, { waitUntil: "domcontentloaded" });
    await w(1200);
    await scroll(page, 350);
    await w(800);
    await scroll(page, 350);
    await w(600);
    await scroll(page, -700);
    await w(400);

    // ──────────────────────────────────────────────────────
    // 4. CAMPAGNES — liste + détail  (~12s)
    // ──────────────────────────────────────────────────────
    console.log("4/10 Campagnes");
    await page.goto(`${BASE_URL}/agency/discover`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await scroll(page, 300);
    await w(700);

    // Cliquer sur la première campagne
    const campaignId = await getCampaignId(page, "agency");
    if (campaignId) {
      await page.goto(`${BASE_URL}/agency/campaign/${campaignId}`, { waitUntil: "domcontentloaded" });
      await w(1200);
      await scroll(page, 300);
      await w(600);
      // Onglet Clippeurs
      await clickTab(page, "Clippeurs");
      await scroll(page, 200);
      await w(800);
      // Onglet Analytics / Vidéos
      await clickTab(page, "Vidéos");
      await w(700);
      await clickTab(page, "Analytics");
      await w(700);
    }

    // ──────────────────────────────────────────────────────
    // 5. CHAT AGENCE — Questions + Conseils + Paiement  (~10s)
    // ──────────────────────────────────────────────────────
    console.log("5/10 Chat agence");
    if (campaignId) {
      await page.goto(`${BASE_URL}/agency/campaign/${campaignId}/chat`, { waitUntil: "domcontentloaded" });
      await w(1000);
      await clickTab(page, "Questions");
      await w(600);
      await clickTab(page, "Conseils");
      await w(600);
      await clickTab(page, "Paiement");
      await w(800);
    }

    // ──────────────────────────────────────────────────────
    // 6. CRÉER UNE CAMPAGNE  (~5s)
    // ──────────────────────────────────────────────────────
    console.log("6/10 Créer campagne");
    await page.goto(`${BASE_URL}/agency/create`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await scroll(page, 300);
    await w(700);

    // ──────────────────────────────────────────────────────
    // 7. PAIEMENT AGENCE (billing)  (~4s)
    // ──────────────────────────────────────────────────────
    console.log("7/10 Paiement agence");
    await page.goto(`${BASE_URL}/agency/payment`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await scroll(page, 300);
    await w(600);

    // ──────────────────────────────────────────────────────
    // 8. LOGOUT + LOGIN CLIPPEUR  (~8s)
    // ──────────────────────────────────────────────────────
    console.log("8/10 Login clippeur");
    // Logout via API
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await w(500);
    await login(page, CLIPPER.email, CLIPPER.password);

    // ──────────────────────────────────────────────────────
    // 9. DASHBOARD CLIPPEUR  (~10s)
    // ──────────────────────────────────────────────────────
    console.log("9/10 Dashboard clippeur");
    await page.goto(`${BASE_URL}/clipper`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await scroll(page, 350);
    await w(600);

    // Mes comptes
    await page.goto(`${BASE_URL}/clipper/accounts`, { waitUntil: "domcontentloaded" });
    await w(900);

    // Mes vidéos trackées
    await page.goto(`${BASE_URL}/clipper/videos`, { waitUntil: "domcontentloaded" });
    await w(900);
    await scroll(page, 300);
    await w(600);

    // Marketplace — découvrir les campagnes
    await page.goto(`${BASE_URL}/clipper/discover`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await scroll(page, 300);
    await w(600);

    // ──────────────────────────────────────────────────────
    // 10. CHAT CLIPPEUR — Rémunération + Réclamer  (~8s)
    // ──────────────────────────────────────────────────────
    console.log("10/10 Chat clippeur");
    const clipperCampaignId = await getCampaignId(page, "clipper");
    if (clipperCampaignId) {
      await page.goto(`${BASE_URL}/clipper/campaign/${clipperCampaignId}/chat`, { waitUntil: "domcontentloaded" });
      await w(1000);
      await clickTab(page, "Questions");
      await w(500);
      await clickTab(page, "Conseils");
      await w(500);
      await clickTab(page, "Rémunération");
      await w(1200);
    }

    // Paiement clippeur
    await page.goto(`${BASE_URL}/clipper/payment`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await scroll(page, 300);
    await w(600);

    // ──────────────────────────────────────────────────────
    // FIN — retour landing
    // ──────────────────────────────────────────────────────
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await w(1500);
    await scroll(page, -500);
    await w(1000);

    console.log("\n✅ Démo terminée !");

  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }

  await context.close();
  await browser.close();

  // Renommer la vidéo
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".webm"));
  if (files.length) {
    const latest = files.sort().pop();
    const out = path.join(OUTPUT_DIR, "demo.webm");
    fs.renameSync(path.join(OUTPUT_DIR, latest), out);
    console.log(`\n📹 Vidéo : ${out}`);
    console.log(`🔄 Convertir en MP4 :`);
    console.log(`   ffmpeg -i "${out}" -c:v libx264 -crf 20 "${path.join(OUTPUT_DIR, "demo.mp4")}"\n`);
  }
}

main().catch(console.error);
