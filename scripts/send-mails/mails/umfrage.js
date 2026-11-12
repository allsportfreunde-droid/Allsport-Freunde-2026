const betreff = "Kurze Umfrage – Deine Meinung ist gefragt! 🤍";

const text = `Assalamu Alaikum! 🤍

Wir haben bisher 4 Veranstaltungen organisiert – Alhamdulillah! Damit wir
unser Angebot für euch weiterentwickeln können, würden wir uns sehr über
euer kurzes Feedback freuen.

Die Umfrage dauert nur 2 Minuten:
👉 https://forms.gle/cZFWxLcEt5kD2eyP7

Jazakallahu Khairan! 🤍`;

const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px 0">
  <div style="background:#fff;margin:0 auto;padding:40px 28px;max-width:520px;border-radius:8px">

    <p style="font-size:22px;font-weight:bold;color:#1a1a1a;margin:0 0 16px">
      Deine Meinung zählt 🤍
    </p>

    <p style="font-size:15px;line-height:26px;color:#333;margin:0 0 12px">
      Assalamu Alaikum,
    </p>

    <p style="font-size:15px;line-height:26px;color:#333;margin:0 0 12px">
      Alhamdulillah – wir haben bisher <strong>4 Veranstaltungen</strong>
      gemeinsam erlebt! Damit wir unser Angebot für euch
      weiterentwickeln können, würden wir uns sehr über dein
      kurzes Feedback freuen.
    </p>

    <div style="background:#f0f7ff;border-radius:8px;padding:14px 18px;margin:16px 0">
      <p style="font-size:14px;line-height:22px;color:#333;margin:4px 0">
        ⏱️ <strong>Dauer:</strong> ca. 2 Minuten
      </p>
      <p style="font-size:14px;line-height:22px;color:#333;margin:4px 0">
        📋 <strong>Themen:</strong> Feedback, Wünsche & Mitgliedschaft
      </p>
      <p style="font-size:14px;line-height:22px;color:#333;margin:4px 0">
        🔒 <strong>Anonym:</strong> Keine Namensangabe nötig
      </p>
    </div>

    <p style="font-size:15px;line-height:26px;color:#333;margin:0 0 12px">
      Jede Antwort hilft uns, bessere Veranstaltungen für
      unsere Gemeinschaft zu organisieren.
    </p>

    <a href="https://forms.gle/cZFWxLcEt5kD2eyP7"
       style="background:#2563eb;border-radius:6px;color:#fff;display:inline-block;
              font-size:15px;font-weight:bold;padding:12px 28px;
              text-decoration:none;margin:16px 0">
      Zur Umfrage →
    </a>

    <hr style="border:none;border-top:1px solid #e6ebf1;margin:28px 0 16px">

    <p style="font-size:12px;color:#8898aa;line-height:20px;margin:0">
      Allsport Freunde 2026 e.V. – Gemeinsam sportlich in der Rhein-Main-Region
    </p>

  </div>
</body>
</html>
`;

module.exports = { betreff, text, html };
