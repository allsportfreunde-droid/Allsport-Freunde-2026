const nodemailer = require("nodemailer");
const csv = require("csv-parser");
const fs = require("fs");
require("dotenv").config();

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Einstellungen ──────────────────────────────────────────
const GMAIL_ADRESSE = process.env.GMAIL_ADRESSE;
const APP_PASSWORT = process.env.APP_PASSWORT;
const CSV_DATEI = process.env.CSV_DATEI;
const EMAIL_SPALTE = "E-Mail"; // Spaltenname in der CSV
// ───────────────────────────────────────────────────────────

// Vorlage wählen: node send-mails.js <name>  (z. B. review, umfrage → mails/<name>.js)
const MAIL_NAME = process.argv[2];
if (!MAIL_NAME || !fs.existsSync(`${__dirname}/mails/${MAIL_NAME}.js`)) {
  const vorhanden = fs.readdirSync(`${__dirname}/mails`).map((f) => f.replace(/\.js$/, ""));
  console.error(`Aufruf: node send-mails.js <vorlage>\nVorhanden: ${vorhanden.join(", ")}`);
  process.exit(1);
}
const { betreff, text: textNachricht, html: htmlNachricht } = require(`./mails/${MAIL_NAME}`);
if (htmlNachricht.includes("HIER_LINK_EINTRAGEN")) {
  console.error(`Vorlage "${MAIL_NAME}" enthält noch den Platzhalter-Link – Abbruch.`);
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_ADRESSE,
    pass: APP_PASSWORT,
  },
});

async function sendEmails() {
  const emails = [];
  const bereitsGesendet = new Set();

  // CSV einlesen
  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_DATEI)
      .pipe(csv({ separator: ";" }))
      .on("data", (row) => {
        const email = row[EMAIL_SPALTE]?.trim().toLowerCase();
        if (email && !bereitsGesendet.has(email)) {
          emails.push(email);
          bereitsGesendet.add(email);
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`${emails.length} eindeutige E-Mails gefunden.`);
  console.log("Starte Versand...\n");

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    try {
      await transporter.sendMail({
        from: '"Allsport Freunde 2026 e.V." <info@allsport-freunde.com>',
        to: email,
        subject: betreff,
        html: htmlNachricht,
        text: textNachricht,
      });
      console.log(`✓ [${i + 1}/${emails.length}] Gesendet: ${email}`);
    } catch (err) {
      console.error(
        `✗ [${i + 1}/${emails.length}] Fehler bei ${email}: ${err.message}`,
      );
    }

    // 1.5 Sekunden Pause zwischen jeder E-Mail
    if (i < emails.length - 1) {
      await delay(1500);
    }
  }

  console.log("\nFertig!");
}

sendEmails();
