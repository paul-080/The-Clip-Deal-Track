/**
 * The Clip Deal — Demo Video Recorder
 * Navigue automatiquement sur le site et enregistre une vidéo de présentation.
 *
 * Usage:
 *   node scripts/record-demo.js [URL]
 *   node scripts/record-demo.js https://ton-app.railway.app
 *
 * La vidéo est sauvegardée dans scripts/demo-output/demo.webm
 * Convertir en MP4 : ffmpeg -i demo.webm -c:v libx264 demo.mp4
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = process.argv[2] || "http://localhost:3001";
const OUTPUT_DIR = path.join(__dirname, "demo-output");
const SLOW_MO = 800; // ms entre chaque action (augmenter pour ralentir)

// Credentials de démo
const AGENCY = { email: "agency@clipdeal.com", password: "demo1234" };
const CLIPPER = { email: "jean@clipdeal.com", password: "demo1234" };

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function smoothScroll(page, direction = "down", amount = 400) {
  await page.evaluate(
    ({ dir, amt }) => window.scrollBy(0, dir === "down" ? amt : -amt),
    { dir: direction, amt: amount }
  );
  await wait(600);
}

async function typeSlowly(locator, text, delay = 60) {
  await locator.click();
  await locator.fill("");
  for (const char of text) {
    await locator.type(char, { delay });
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\n🎬 Démarrage de l'enregistrement — ${BASE_URL}\n`);

  const browser = await chromium.launch({
    headless: false, // mettre true pour tourner en arrière-plan
    slowMo: SLOW_MO,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1440, height: 900 },
    },
    locale: "fr-FR",
  });

  const page = await context.newPage();

  try {
    // ════════════════════════════════════════════
    // SCÈNE 1 — Landing page
    // ════════════════════════════════════════════
    console.log("📍 Scène 1 : Landing page");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await wait(2500);
    await smoothScroll(page, "down", 400);
    await wait(1500);
    await smoothScroll(page, "down", 500);
    await wait(1500);
    await smoothScroll(page, "down", 500);
    await wait(1500);
    await smoothScroll(page, "up", 1400);
    await wait(1000);

    // ════════════════════════════════════════════
    // SCÈNE 2 — Connexion Agence
    // ════════════════════════════════════════════
    console.log("📍 Scène 2 : Connexion agence");
    const loginBtn = page.getByRole("link", { name: /connexion|login|se connecter/i }).first();
    if (await loginBtn.isVisible()) await loginBtn.click();
    else await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await wait(1500);

    const emailInput = page.getByPlaceholder(/email/i).first();
    const passwordInput = page.getByPlaceholder(/mot de passe|password/i).first();
    if (await emailInput.isVisible()) {
      await typeSlowly(emailInput, AGENCY.email);
      await wait(400);
      await typeSlowly(passwordInput, AGENCY.password);
      await wait(600);
      await page.getByRole("button", { name: /connexion|se connecter|login/i }).first().click();
      await page.waitForNavigation({ waitUntil: "networkidle", timeout: 10000 }).catch(() => {});
      await wait(2000);
    }

    // ════════════════════════════════════════════
    // SCÈNE 3 — Dashboard Agence
    // ════════════════════════════════════════════
    console.log("📍 Scène 3 : Dashboard agence");
    await wait(2500);
    await smoothScroll(page, "down", 300);
    await wait(1500);
    await smoothScroll(page, "down", 300);
    await wait(1500);

    // ════════════════════════════════════════════
    // SCÈNE 4 — Liste des campagnes
    // ════════════════════════════════════════════
    console.log("📍 Scène 4 : Campagnes");
    const campaignsLink = page.getByRole("link", { name: /campagne/i }).first();
    if (await campaignsLink.isVisible()) {
      await campaignsLink.click();
      await wait(2000);
    }
    await smoothScroll(page, "down", 300);
    await wait(1500);

    // Cliquer sur la première campagne
    const firstCampaign = page.locator("[data-testid='campaign-card'], .campaign-card, [href*='/campaign/']").first();
    if (await firstCampaign.isVisible()) {
      await firstCampaign.click();
      await wait(2500);
    }

    // ════════════════════════════════════════════
    // SCÈNE 5 — Détail campagne + clippeurs
    // ════════════════════════════════════════════
    console.log("📍 Scène 5 : Détail campagne");
    await smoothScroll(page, "down", 300);
    await wait(1500);

    // Cliquer sur l'onglet Clippeurs si visible
    const clippersTab = page.getByRole("tab", { name: /clippeur/i }).first();
    if (await clippersTab.isVisible()) {
      await clippersTab.click();
      await wait(2000);
    }

    // ════════════════════════════════════════════
    // SCÈNE 6 — Chat campagne
    // ════════════════════════════════════════════
    console.log("📍 Scène 6 : Chat");
    const chatTab = page.getByRole("tab", { name: /chat|message/i }).first();
    if (await chatTab.isVisible()) {
      await chatTab.click();
      await wait(2000);
    }

    // ════════════════════════════════════════════
    // SCÈNE 7 — Déconnexion + Connexion Clippeur
    // ════════════════════════════════════════════
    console.log("📍 Scène 7 : Vue clippeur");
    // Déconnexion
    const logoutBtn = page.getByRole("button", { name: /déconnexion|logout|quitter/i }).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await wait(1500);
    } else {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await wait(1000);
    }

    // Connexion clippeur
    const emailInput2 = page.getByPlaceholder(/email/i).first();
    const passwordInput2 = page.getByPlaceholder(/mot de passe|password/i).first();
    if (await emailInput2.isVisible()) {
      await typeSlowly(emailInput2, CLIPPER.email);
      await wait(400);
      await typeSlowly(passwordInput2, CLIPPER.password);
      await wait(600);
      await page.getByRole("button", { name: /connexion|se connecter|login/i }).first().click();
      await page.waitForNavigation({ waitUntil: "networkidle", timeout: 10000 }).catch(() => {});
      await wait(2500);
    }

    // ════════════════════════════════════════════
    // SCÈNE 8 — Dashboard Clippeur (stats + wallet)
    // ════════════════════════════════════════════
    console.log("📍 Scène 8 : Dashboard clippeur");
    await smoothScroll(page, "down", 300);
    await wait(1500);
    await smoothScroll(page, "down", 300);
    await wait(2000);

    // Wallet / Rémunération
    const walletTab = page.getByRole("tab", { name: /wallet|cagnotte|rémunération/i }).first();
    if (await walletTab.isVisible()) {
      await walletTab.click();
      await wait(2000);
    }

    // ════════════════════════════════════════════
    // FIN — pause finale
    // ════════════════════════════════════════════
    console.log("📍 Fin de la démo");
    await wait(3000);
    await smoothScroll(page, "up", 1000);
    await wait(2000);

  } catch (err) {
    console.error("❌ Erreur pendant l'enregistrement :", err.message);
  }

  await context.close(); // déclenche la sauvegarde de la vidéo
  await browser.close();

  // Trouver le fichier vidéo généré
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".webm"));
  if (files.length > 0) {
    const latest = files.sort().pop();
    const finalPath = path.join(OUTPUT_DIR, "demo.webm");
    fs.renameSync(path.join(OUTPUT_DIR, latest), finalPath);
    console.log(`\n✅ Vidéo sauvegardée : ${finalPath}`);
    console.log(`\n💡 Convertir en MP4 :`);
    console.log(`   ffmpeg -i "${finalPath}" -c:v libx264 -crf 20 "${path.join(OUTPUT_DIR, "demo.mp4")}"\n`);
  } else {
    console.log("⚠️  Aucune vidéo trouvée dans", OUTPUT_DIR);
  }
}

main().catch(console.error);
