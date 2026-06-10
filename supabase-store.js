(function () {
  "use strict";

  const config = window.SANGMUOK_CONFIG;
  if (!config || !window.supabase) {
    throw new Error("Supabase 설정을 불러오지 못했습니다.");
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  let currentProfile = null;
  let reservationBaseline = new Map();
  let reservationSync = Promise.resolve();
  let realtimeChannel = null;

  function loginEmail(id) {
    return id.includes("@") ? id : `${id}@sangmuok.local`;
  }

  function normalizeTime(value) {
    return String(value || "12:00").slice(0, 5);
  }

  function toAppReservation(row) {
    const time = normalizeTime(row.reservation_time);
    const timeH = Number(time.split(":")[0]);
    return {
      id: Number(row.id),
      time,
      timeH,
      name: row.customer_name || "",
      people: String(row.people_count || ""),
      memo: row.memo || "",
      table: row.table_name || "",
      phone: row.phone || "",
      roomRequested: Boolean(row.room_requested),
      status: row.status || "pending"
    };
  }

  function toDbReservation(dateKey, reservation, includeOwner) {
    const payload = {
      customer_name: reservation.name || "",
      phone: reservation.phone || null,
      reservation_date: dateKey,
      reservation_time: `${normalizeTime(reservation.time)}:00`,
      people_count: Number(reservation.people) || null,
      room_requested: Boolean(
        reservation.roomRequested || /룸/.test(reservation.memo || "")
      ),
      memo: reservation.memo || "",
      status: reservation.status || "pending",
      updated_by: currentProfile?.display_name || null,
      table_name: reservation.table || ""
    };
    if (includeOwner) payload.created_by = currentProfile?.id;
    return payload;
  }

  function comparable(row) {
    return {
      customer_name: row.customer_name || "",
      phone: row.phone || null,
      reservation_date: row.reservation_date,
      reservation_time: `${normalizeTime(row.reservation_time)}:00`,
      people_count: row.people_count == null ? null : Number(row.people_count),
      room_requested: Boolean(row.room_requested),
      memo: row.memo || "",
      status: row.status || "pending",
      updated_by: row.updated_by || null,
      table_name: row.table_name || ""
    };
  }

  function changedFields(next, previous) {
    return Object.fromEntries(
      Object.entries(next).filter(([key, value]) => previous[key] !== value)
    );
  }

  function groupReservations(rows) {
    const grouped = {};
    reservationBaseline = new Map();
    rows.forEach((row) => {
      const dateKey = row.reservation_date;
      if (!grouped[dateKey]) grouped[dateKey] = { am: [], pm: [] };
      const item = toAppReservation(row);
      const slot = item.timeH < 16 ? "am" : "pm";
      grouped[dateKey][slot].push(item);
      reservationBaseline.set(item.id, comparable(row));
    });
    Object.values(grouped).forEach((slots) => {
      slots.am.sort((a, b) => a.time.localeCompare(b.time));
      slots.pm.sort((a, b) => a.time.localeCompare(b.time));
    });
    return grouped;
  }

  async function requireProfile(user) {
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, role")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    currentProfile = data;
    return {
      id: user.email?.split("@")[0] || user.id,
      uid: user.id,
      email: user.email,
      name: data.display_name,
      role: data.role
    };
  }

  async function getCurrentUser() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) return null;
    return requireProfile(data.session.user);
  }

  async function signIn(id, password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail(id),
      password
    });
    if (error) throw error;
    return requireProfile(data.user);
  }

  async function signOut() {
    unsubscribe();
    currentProfile = null;
    reservationBaseline = new Map();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function loadReservations() {
    const { data, error } = await client
      .from("reservations")
      .select(
        "id, customer_name, phone, reservation_date, reservation_time, people_count, room_requested, memo, status, updated_by, table_name, created_by"
      )
      .order("reservation_date")
      .order("reservation_time");
    if (error) throw error;
    return groupReservations(data || []);
  }

  function flattenReservations(grouped) {
    const items = [];
    Object.entries(grouped).forEach(([dateKey, slots]) => {
      ["am", "pm"].forEach((slot) => {
        (slots[slot] || []).forEach((reservation) => {
          items.push({ dateKey, reservation });
        });
      });
    });
    return items;
  }

  async function performReservationSync(grouped) {
    if (!currentProfile) throw new Error("로그인이 필요합니다.");

    const localItems = flattenReservations(grouped);
    const localIds = new Set(
      localItems
        .map(({ reservation }) => Number(reservation.id))
        .filter((id) => reservationBaseline.has(id))
    );

    for (const id of reservationBaseline.keys()) {
      if (!localIds.has(id)) {
        const { error } = await client.from("reservations").delete().eq("id", id);
        if (error) throw error;
        reservationBaseline.delete(id);
      }
    }

    for (const item of localItems) {
      const id = Number(item.reservation.id);
      const previous = reservationBaseline.get(id);
      if (!previous) {
        const payload = toDbReservation(item.dateKey, item.reservation, true);
        const { data, error } = await client
          .from("reservations")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        item.reservation.id = Number(data.id);
        reservationBaseline.set(Number(data.id), comparable(data));
        continue;
      }

      const next = toDbReservation(item.dateKey, item.reservation, false);
      const patch = changedFields(next, previous);
      if (!Object.keys(patch).length) continue;
      const { data, error } = await client
        .from("reservations")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      reservationBaseline.set(id, comparable(data));
    }
  }

  function syncReservations(grouped) {
    reservationSync = reservationSync.then(
      () => performReservationSync(grouped),
      () => performReservationSync(grouped)
    );
    return reservationSync;
  }

  function toAppMessage(row) {
    return {
      id: Number(row.id),
      time: row.created_at,
      sender: row.sender_name || "직원",
      text: row.message,
      ...(row.reply_to_id ? { replyTo: Number(row.reply_to_id) } : {})
    };
  }

  async function loadMessages() {
    const { data, error } = await client
      .from("messages")
      .select(
        "id, room_id, sender_id, sender_name, message, reply_to_id, created_at"
      )
      .order("created_at")
      .limit(1000);
    if (error) throw error;
    return (data || []).map(toAppMessage);
  }

  async function saveMessage(message) {
    if (!currentProfile) throw new Error("로그인이 필요합니다.");
    const { data, error } = await client
      .from("messages")
      .insert({
        room_id: config.roomId,
        sender_type: "staff",
        sender_id: currentProfile.id,
        sender_name: currentProfile.display_name,
        message: message.text,
        reply_to_id: message.replyTo || null
      })
      .select()
      .single();
    if (error) throw error;
    return toAppMessage(data);
  }

  async function deleteMessage(id) {
    const { error } = await client.from("messages").delete().eq("id", id);
    if (error) throw error;
  }

  async function markRead(messageId) {
    if (!currentProfile || !messageId) return;
    const { error } = await client.from("message_reads").upsert({
      user_id: currentProfile.id,
      last_read_message_id: messageId
    });
    if (error) console.warn("읽음 상태 저장 실패", error);
  }

  function subscribe(onChange) {
    unsubscribe();
    realtimeChannel = client
      .channel("sangmuok-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        () => onChange("reservations")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => onChange("messages")
      )
      .subscribe();
  }

  function unsubscribe() {
    if (!realtimeChannel) return;
    client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  window.SangmuokDB = Object.freeze({
    client,
    getCurrentUser,
    signIn,
    signOut,
    loadReservations,
    syncReservations,
    loadMessages,
    saveMessage,
    deleteMessage,
    markRead,
    subscribe,
    unsubscribe
  });
})();
