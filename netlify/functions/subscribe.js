// Fonction serverless Netlify : ajoute un contact dans Brevo.
// Ajoute le contact à la liste générale, puis à la (ou aux) liste(s) spécifique(s)
// du/des guide(s) choisi(s). Chaque liste guide déclenche sa propre automatisation
// Brevo qui envoie l'email avec le PDF correspondant (1 pièce jointe par email,
// donc 1 automatisation par guide).
//
// Variables d'environnement à définir sur Netlify (Site settings > Environment variables) :
//   BREVO_API_KEY                    -> ta clé API Brevo (commence par "xkeysib-...")
//   BREVO_LIST_ID                    -> ID de la liste générale "Immonaissances - Leads"
//   BREVO_LIST_ID_PREMIER_ACHAT      -> ID de la liste "Immonaissances - Guide Premier Achat"
//   BREVO_LIST_ID_INVESTISSEMENT     -> ID de la liste "Immonaissances - Guide Investissement Locatif"

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let email;
  let guides;
  try {
    const body = JSON.parse(event.body || "{}");
    email = body.email;
    guides = Array.isArray(body.guides) ? body.guides : [];
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

  // Mappe les identifiants de guide envoyés par le formulaire vers les variables d'env Netlify.
  const guideListEnvVars = {
    "premier-achat": "BREVO_LIST_ID_PREMIER_ACHAT",
    "investissement-locatif": "BREVO_LIST_ID_INVESTISSEMENT",
  };

  // Construit la liste de tous les IDs de liste auxquels ajouter le contact :
  // la liste générale + une liste par guide sélectionné (si la variable d'env existe).
  const listIds = new Set([Number(listId)]);
  for (const guide of guides) {
    const envVar = guideListEnvVars[guide];
    const guideListId = envVar && process.env[envVar];
    if (guideListId) {
      listIds.add(Number(guideListId));
    }
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
        listIds: Array.from(listIds),
        updateEnabled: true, // si le contact existe déjà, on le rattache simplement aux listes
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
