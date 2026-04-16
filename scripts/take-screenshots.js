/**
 * The Clip Deal — Screenshot Generator
 * Prend des captures d'écran de chaque fonctionnalité pour le guide Notion.
 * Usage: node scripts/take-screenshots.js https://www.theclipdealtrack.com
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = (process.argv[2] || "http://localhost:3001").replace(/\/$/, "");
const OUT = path.join(__dirname, "screenshots");
const AGENCY  = { email: "agency@clipdeal.com",  password: "demo1234" };
const CLIPPER = { email: "jean@clipdeal.com",     password: "demo1234" };

const w = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function login(page, email, password) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await w(1200);
  await page.locator('button:has-text("Se connecter")').first().click();
  await w(800);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await w(300);
  await page.locator('button:has-text("Se connecter")').last().click();
  await page.waitForURL((u) => u.includes("/agency") || u.includes("/clipper"), { timeout: 12000 }).catch(() => {});
  await w(1200);
}

async function getCampaignId(page, role) {
  const link = page.locator(`a[href*="/${role}/campaign/"]`).first();
  const href = await link.getAttribute("href").catch(() => null);
  if (!href) return null;
  const m = href.match(/\/campaign\/([^/]+)/);
  return m ? m[1] : null;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\n📸 Screenshots — ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true, slowMo: 80 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();

  try {
    // ── Landing ──
    console.log("Landing page");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await w(1500);
    await shot(page, "01-landing");
    await page.evaluate(() => window.scrollBy(0, 500));
    await w(600);
    await shot(page, "02-landing-features");
    await page.evaluate(() => window.scrollBy(0, 600));
    await w(600);
    await shot(page, "03-landing-pricing");

    // ── Login modal ──
    console.log("Login modal");
    await page.evaluate(() => window.scrollTo(0, 0));
    await w(400);
    await page.locator('button:has-text("Se connecter")').first().click();
    await w(800);
    await shot(page, "04-login-modal");

    // ══════════════ AGENCE ══════════════
    console.log("Agence");
    await login(page, AGENCY.email, AGENCY.password);
    await shot(page, "05-agency-dashboard");
    await page.evaluate(() => window.scrollBy(0, 400));
    await w(500);
    await shot(page, "06-agency-dashboard-bottom");

    // Campagnes
    await page.goto(`${BASE_URL}/agency/discover`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "07-agency-campaigns");

    const cid = await getCampaignId(page, "agency");
    if (cid) {
      await page.goto(`${BASE_URL}/agency/campaign/${cid}`, { waitUntil: "domcontentloaded" });
      await w(1200);
      await shot(page, "08-campaign-overview");

      // Onglet Clippeurs
      const tabClip = page.locator('button:has-text("Clippeurs"), [role="tab"]:has-text("Clippeurs")').first();
      if (await tabClip.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabClip.click(); await w(800);
        await shot(page, "09-campaign-clippers");
      }

      // Onglet Vidéos
      const tabVid = page.locator('button:has-text("Vidéos"), [role="tab"]:has-text("Vidéos")').first();
      if (await tabVid.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabVid.click(); await w(800);
        await shot(page, "10-campaign-videos");
      }

      // Onglet Analytics
      const tabAna = page.locator('button:has-text("Analytics"), [role="tab"]:has-text("Analytics")').first();
      if (await tabAna.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabAna.click(); await w(800);
        await shot(page, "11-campaign-analytics");
      }

      // Chat agence
      await page.goto(`${BASE_URL}/agency/campaign/${cid}/chat`, { waitUntil: "domcontentloaded" });
      await w(1000);
      await shot(page, "12-chat-questions");
      const tabConseil = page.locator('button:has-text("Conseils")').first();
      if (await tabConseil.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabConseil.click(); await w(700);
        await shot(page, "13-chat-conseils");
      }
      const tabPay = page.locator('button:has-text("Paiement")').first();
      if (await tabPay.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabPay.click(); await w(700);
        await shot(page, "14-chat-paiement");
      }
    }

    // Créer campagne
    await page.goto(`${BASE_URL}/agency/create`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "15-create-campaign");

    // Paiement agence
    await page.goto(`${BASE_URL}/agency/payment`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "16-agency-billing");

    // Paramètres
    await page.goto(`${BASE_URL}/agency/settings`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "17-agency-settings");

    // ══════════════ CLIPPEUR ══════════════
    console.log("Clippeur");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await w(600);
    await login(page, CLIPPER.email, CLIPPER.password);
    await shot(page, "18-clipper-dashboard");

    await page.goto(`${BASE_URL}/clipper/discover`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "19-clipper-discover");

    await page.goto(`${BASE_URL}/clipper/accounts`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "20-clipper-accounts");

    await page.goto(`${BASE_URL}/clipper/videos`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "21-clipper-videos");

    await page.goto(`${BASE_URL}/clipper/payment`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "22-clipper-payment");

    const clipCid = await getCampaignId(page, "clipper");
    if (clipCid) {
      await page.goto(`${BASE_URL}/clipper/campaign/${clipCid}/chat`, { waitUntil: "domcontentloaded" });
      await w(1000);
      await shot(page, "23-clipper-chat-questions");
      const tabRem = page.locator('button:has-text("Rémunération")').first();
      if (await tabRem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabRem.click(); await w(800);
        await shot(page, "24-clipper-remuneration");
      }
    }

    await page.goto(`${BASE_URL}/clipper/settings`, { waitUntil: "domcontentloaded" });
    await w(1000);
    await shot(page, "25-clipper-settings");

  } catch (e) {
    console.error("❌", e.message);
  }

  await ctx.close();
  await browser.close();

  const shots = fs.readdirSync(OUT).filter(f => f.endsWith(".png"));
  console.log(`\n✅ ${shots.length} screenshots dans : ${OUT}\n`);
}

main().catch(console.error);
