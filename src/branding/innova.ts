/** Official supplied logo. Never redraw, recolor, or replace with a font. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const INNOVA_LOGO_SHA256 = "e55b6e6b168811442490d1ceca0f937c0c55676c90e9f924b2dba877a0ef3d78";
const logo = readFileSync(new URL("../../docs/branding/assets/innova-logo.svg", import.meta.url));
if (logo.length !== 2074 || createHash("sha256").update(logo).digest("hex") !== INNOVA_LOGO_SHA256) {
  throw new Error("Resmi Innova logo dosyasi degismis; kurumsal kimlik paketindeki orijinal dosyayi kullanin");
}
export const INNOVA_LOGO_DATA_URL = `data:image/svg+xml;base64,${logo.toString("base64")}`;

// 2025 guide pp.8-14. X clear space equals one logo letter height; minimum 25px.
// No font binaries supplied: Open Sans when installed, official Arial fallback.
export const INNOVA_UI_CSS = `:root{font-family:'Open Sans',Arial,sans-serif;color:#3F3F3F}header{border-top-color:#ED3340;padding-top:32px;padding-bottom:32px;padding-left:max(32px,calc((100vw - 1260px)/2));padding-right:max(32px,calc((100vw - 1260px)/2))}.brand{gap:32px;min-width:0}.brand-copy{min-width:0;padding:0;border:0}.brand .innova-logo{display:block;flex:none;height:28px;width:auto;max-width:none;object-fit:contain}h1,h2,h3{color:#000000}.primary{background:#182C55;border-color:#182C55}.metric strong,.actions a{color:#182C55}:focus-visible{outline-color:#182C55}@media(max-width:640px){header{padding:25px}.brand{gap:25px}.brand .innova-logo{height:25px}.brand-copy b{font-size:11px}.brand-copy small{font-size:7px;letter-spacing:.5px}}`;

export const INNOVA_REPORT_CSS = `:root{--ink:#000000;--copy:#3F3F3F;--brand:#ED3340;--slate:#182C55;--focus:#182C55}body{font-family:'Open Sans',Arial,sans-serif}.brandbar{padding:32px;flex-wrap:wrap;row-gap:32px}.brandgroup{gap:32px;min-width:0}.brandgroup>div:last-child{min-width:0}.logo{height:28px;width:auto;max-width:none;flex:none;object-fit:contain}.product-name{white-space:normal}@media(max-width:640px){.brandbar{padding:25px;row-gap:25px}.brandgroup{gap:25px}.brand-separator{display:none}.logo{height:25px;width:auto}.product-name{font-size:11px}.product-tag{font-size:7px}}`;
