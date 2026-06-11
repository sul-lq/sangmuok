import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header is required.");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authError } = await userClient.auth.getUser();
    if (authError || !claims.user) throw new Error("Unauthorized.");

    const { title, body, url: targetUrl = "./", tag = "sangmuok" } =
      await request.json();
    if (!title || !body) throw new Error("title and body are required.");

    webpush.setVapidDetails(
      "mailto:admin@sangmuok.app",
      vapidPublicKey,
      vapidPrivateKey,
    );

    const admin = createClient(url, serviceRoleKey);
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .neq("user_id", claims.user.id);
    if (error) throw error;

    const payload = JSON.stringify({
      title,
      body,
      url: targetUrl,
      tag,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
    });

    let sent = 0;
    let removed = 0;
    await Promise.all(
      (subscriptions || []).map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          );
          sent += 1;
        } catch (pushError) {
          const statusCode = Number(pushError?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", subscription.endpoint);
            removed += 1;
          } else {
            console.error("Push delivery failed", pushError);
          }
        }
      }),
    );

    return new Response(JSON.stringify({ sent, removed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error.message || error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
