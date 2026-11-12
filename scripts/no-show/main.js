const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "check-in.csv");

/** Einfacher CSV-Parser für quoted Felder */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const fields = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let value = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            value += line[i++];
          }
        }
        fields.push(value);
        if (line[i] === ",") i++;
      } else {
        let value = "";
        while (i < line.length && line[i] !== ",") value += line[i++];
        fields.push(value);
        if (line[i] === ",") i++;
      }
    }
    rows.push(fields);
  }
  return rows;
}

/** Jedes Wort mit großem Anfangsbuchstaben (z. B. „mustafa akdogan“ → „Mustafa Akdogan“) */
function capitalizeName(name) {
  return name
    .split(/\s+/)
    .map((part) =>
      part.length === 0
        ? part
        : part[0].toLocaleUpperCase("de-DE") +
          part.slice(1).toLocaleLowerCase("de-DE")
    )
    .join(" ");
}

/** Führende 0 durch +49 ersetzen (Leerzeichen werden entfernt) */
function formatTelefon(telefon) {
  const trimmed = telefon.trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.replace(/\s/g, "");
  if (normalized.startsWith("+49")) return normalized;
  if (normalized.startsWith("0")) return "+49" + normalized.slice(1);
  return trimmed;
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
const [header, ...dataRows] = parseCsv(raw);

const col = (name) => header.indexOf(name);
const nameIdx = col("Name");
const telefonIdx = col("Telefon");
const begleiterIdx = col("Begleiter");
const statusIdx = col("Status");

const noShows = dataRows
  .filter((row) => row[statusIdx] === "Ausstehend")
  .map((row) => {
    const begleiter = Number.parseInt(row[begleiterIdx] ?? "0", 10) || 0;
    const x = begleiter + 1; // Person + Begleitpersonen
    return {
      name: capitalizeName(row[nameIdx].trim()),
      personen: x,
      begleitperson: x - 1,
      betrag: x * 5,
      telefon: formatTelefon(row[telefonIdx] ?? ""),
    };
  });

const summePersonen = noShows.reduce((s, n) => s + n.personen, 0);
const summeBetrag = noShows.reduce((s, n) => s + n.betrag, 0);

console.log(`No-Show (Ausstehend): ${noShows.length}\n`);

for (const { name, begleitperson, betrag, telefon } of noShows) {
  console.log(
    `Begleitperson: ${begleitperson} | ${betrag}€ | ${telefon} | ${name}`
  );
}

console.log(`\n${summePersonen} Personen | ${summeBetrag}€`);
