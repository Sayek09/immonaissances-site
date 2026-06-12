// Fonction serverless Netlify : ajoute un contact dans Brevo.
// Déclenche automatiquement l'automatisation Brevo (envoi des 2 PDF) si elle est
// configurée sur "contact ajouté à la liste".
//
// Variables d'environnement à définir sur Netlify (Site settings > Environment variables) :
//   BREVO_API_KEY  -> ta clé API Brevo (commence par "xkeysib-...")
//   BREVO_LIST_ID  -> l'ID numérique de ta liste "Immonaissances - Leads"

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let email;
  try {
    const body = JSON.parse(event.body || "{}");
    email = body.email;
  } catch {
    return { statusCode: 400, body: "Bad Request" };
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, body: "Invalid email" };
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_LIST_ID;

  if (!apiKey || !listId) {
    return { statusCode: 500, body: "Server misconfiguration" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [Number(listId)],
        updateEnabled: true, // si le contact existe déjà, on le rattache simplement à la liste
      }),
    });

    // Brevo renvoie 201 (créé) ou 204 (déjà existant, mis à jour) -> succès
    // Un email déjà présent dans la liste peut renvoyer 400 "duplicate_parameter" -> on traite aussi comme succès
    if (res.ok || res.status === 204) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const data = await res.json().catch(() => ({}));
    if (data.code === "duplicate_parameter") {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    console.error("Brevo error:", res.status, data);
    return { statusCode: 502, body: "Brevo error" };
  } catch (err) {
    console.error("Fetch error:", err);
    return { statusCode: 502, body: "Network error" };
  }
}
