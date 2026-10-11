
/*
 * app.js — SAM Residents and Bookings
 *
 * Features:
 * - Supabase email/password login and logout
 * - Load and refresh residents and bookings
 * - Search residents
 * - Add residents and their accommodation bookings
 * - Edit booking dates and room type
 * - Delete individual bookings
 * - Delete residents and all linked bookings
 *
 * IMPORTANT:
 * This version connects directly to Supabase for local testing.
 * Never put a Supabase secret/service_role key in this file.
 * Do not publish this version to GitHub Pages if you want to keep
 * your Supabase URL/key out of the repository.
 */

// ============================================================
// 1. SUPABASE CONFIGURATION
// ============================================================

// Replace these placeholders with your Supabase project details
// for local testing. Use your publishable key, never service_role.
const SUPABASE_URL = "https://waqqjervkanalczfvons.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_l8Er0zfUrzey07LOpQ7WFw_DWNcBzG0";

if (!window.supabase) {
  throw new Error(
    "Supabase library not found. Check that the Supabase CDN script is included in index.html."
  );
}

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// ============================================================
// 2. DOM HELPERS AND STATE
// ============================================================

const $ = (id) => document.getElementById(id);

let residents = [];
let bookings = [];
let currentUser = null;

function setMessage(elementId, message, type = "") {
  const element = $(elementId);

  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.className = "message";

  if (type) {
    element.classList.add(type);
  }
}

function clearMessage(elementId) {
  setMessage(elementId, "");
}

function showLogin() {
  $("loginSection")?.classList.remove("hidden");
  $("dashboardSection")?.classList.add("hidden");
}

function showDashboard() {
  $("loginSection")?.classList.add("hidden");
  $("dashboardSection")?.classList.remove("hidden");
}

function formatDate(dateString) {
  if (!dateString) return "—";

  // Keep date-only values from shifting because of timezone conversion.
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return replacements[character];
  });
}

function validateAccommodationDates(inDate, outDate) {
  if (!inDate || !outDate) {
    return "Please enter both the accommodation start and end dates.";
  }

  if (outDate <= inDate) {
    return "The end date must be after the start date.";
  }

  return null;
}

// ============================================================
// 3. LOGIN, SESSION AND LOGOUT
// ============================================================

async function handleLogin(event) {
  event.preventDefault();
  clearMessage("loginMessage");

  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    setMessage("loginMessage", "Enter your email and password.", "error");
    return;
  }

  const submitButton = $("loginForm")?.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  setMessage("loginMessage", "Signing in...");

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    currentUser = data.user;
    $("password").value = "";
    showDashboard();

    await loadResidents();
  } catch (error) {
    setMessage("loginMessage", error.message, "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleLogout() {
  const { error } = await client.auth.signOut();

  if (error) {
    console.error("Logout error:", error);
    setMessage("tableMessage", error.message, "error");
    return;
  }

  currentUser = null;
  residents = [];
  bookings = [];

  if ($("residentTableBody")) {
    $("residentTableBody").replaceChildren();
  }

  $("editBookingSection")?.classList.add("hidden");
  showLogin();
}

async function checkExistingSession() {
  const { data, error } = await client.auth.getSession();

  if (error) {
    console.error("Session check failed:", error);
    showLogin();
    return;
  }

  currentUser = data.session?.user ?? null;

  if (currentUser) {
    showDashboard();
    await loadResidents();
  } else {
    showLogin();
  }
}

// ============================================================
// 4. LOAD RESIDENTS AND BOOKINGS
// ============================================================

async function loadResidents() {
  if (!currentUser) return;

  setMessage("tableMessage", "Loading residents...");

  if ($("refreshButton")) {
    $("refreshButton").disabled = true;
  }

  try {
    const [
      { data: residentData, error: residentError },
      { data: bookingData, error: bookingError },
    ] = await Promise.all([
      client
        .from("sam_residents")
        .select(
          "res_id, first_name, last_name, room_number, room_id, camp_id"
        )
        .order("res_id", { ascending: true }),

      client
        .from("sam_bookings")
        .select(
          "id, res_id, room_id, room_number, in_date, out_date, camp_id, camp_details, room_type"
        )
        .order("id", { ascending: true }),
    ]);

    if (residentError) throw residentError;
    if (bookingError) throw bookingError;

    residents = residentData ?? [];
    bookings = bookingData ?? [];

    renderResidents();

    setMessage(
      "tableMessage",
      `Loaded ${residents.length} resident(s).`,
      "success"
    );
  } catch (error) {
    console.error("Failed to load data:", error);
    setMessage("tableMessage", error.message, "error");
  } finally {
    if ($("refreshButton")) {
      $("refreshButton").disabled = false;
    }
  }
}

// ============================================================
// 5. RENDER RESIDENT TABLE
// ============================================================

function renderResidents() {
  const tableBody = $("residentTableBody");

  if (!tableBody) return;

  tableBody.replaceChildren();

  const searchTerm = ($("searchInput")?.value ?? "")
    .trim()
    .toLowerCase();

  const filteredResidents = residents.filter((resident) => {
    const searchableValues = [
      resident.res_id,
      resident.first_name,
      resident.last_name,
      resident.room_number,
      resident.room_id,
      resident.camp_id,
    ];

    return searchableValues.some((value) =>
      String(value ?? "").toLowerCase().includes(searchTerm)
    );
  });

  const countElement = $("residentCount");

  if (countElement) {
    countElement.textContent = String(filteredResidents.length);
  }

  if (filteredResidents.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 9;
    cell.textContent = searchTerm
      ? "No residents match your search."
      : "No residents found.";

    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  filteredResidents.forEach((resident) => {
    const residentBookings = bookings.filter(
      (booking) => booking.res_id === resident.res_id
    );

    // Show one row per booking. If a resident has no booking,
    // show the resident once with blank accommodation fields.
    const rowsToDisplay = residentBookings.length
      ? residentBookings
      : [null];

    rowsToDisplay.forEach((booking) => {
      const row = document.createElement("tr");

      const values = [
        resident.res_id,
        resident.first_name,
        resident.last_name || "—",
        resident.room_number || booking?.room_number || "—",
        resident.room_id ?? booking?.room_id ?? "—",
        resident.camp_id ?? booking?.camp_id ?? "—",
        formatDate(booking?.in_date),
        formatDate(booking?.out_date),
        booking?.room_type || "—",
      ];

      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
      });

      const actions = document.createElement("td");
      actions.className = "action-buttons";

      if (booking) {
        // EDIT BOOKING
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "button secondary";
        editButton.textContent = "Edit booking";

        editButton.addEventListener("click", () => {
          openBookingEditor(resident, booking);
        });

        // DELETE BOOKING ONLY
        const deleteBookingButton = document.createElement("button");
        deleteBookingButton.type = "button";
        deleteBookingButton.className = "delete-button";
        deleteBookingButton.textContent = "Delete booking";

        deleteBookingButton.addEventListener("click", async () => {
          const confirmed = window.confirm(
            `Delete booking ${booking.id} for ` +
              `${resident.first_name} ${resident.last_name || ""}?\n\n` +
              "The resident record will remain."
          );

          if (!confirmed) return;

          await deleteBooking(booking, resident);
        });

        actions.append(
          editButton,
          deleteBookingButton
        );
      }

      // DELETE RESIDENT, INCLUDING LINKED BOOKINGS
      const deleteResidentButton = document.createElement("button");
      deleteResidentButton.type = "button";
      deleteResidentButton.className = "delete-button";
      deleteResidentButton.textContent = "Delete resident";

      deleteResidentButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
          `Permanently delete ${resident.first_name} ` +
            `${resident.last_name || ""} (ID ${resident.res_id})?\n\n` +
            "This will also delete ALL bookings linked to this resident. " +
            "This action cannot be undone."
        );

        if (!confirmed) return;

        await deleteResident(resident);
      });

      actions.appendChild(deleteResidentButton);
      row.appendChild(actions);
      tableBody.appendChild(row);
    });
  });
}

// ============================================================
// 6. ADD RESIDENT AND INITIAL BOOKING
// ============================================================

async function handleAddResident(event) {
  event.preventDefault();
  clearMessage("addResidentMessage");
  clearMessage("tableMessage");

  if (!currentUser) {
    setMessage("addResidentMessage", "Please log in first.", "error");
    return;
  }

  const resIdValue = $("resId")?.value.trim();
  const firstName = $("firstName")?.value.trim();
  const lastName = $("lastName")?.value.trim();
  const roomNumber = $("roomNumber")?.value.trim();
  const roomIdValue = $("roomId")?.value.trim();
  const campIdValue = $("campId")?.value.trim();
  const inDate = $("inDate")?.value;
  const outDate = $("outDate")?.value;
  const roomType = $("roomType")?.value.trim();

  if (!resIdValue || !firstName) {
    setMessage(
      "addResidentMessage",
      "Resident ID and first name are required.",
      "error"
    );
    return;
  }

  const resId = Number(resIdValue);
  const roomId = roomIdValue ? Number(roomIdValue) : null;
  const campId = campIdValue ? Number(campIdValue) : null;

  if (!Number.isSafeInteger(resId) || resId <= 0) {
    setMessage(
      "addResidentMessage",
      "Resident ID must be a positive whole number.",
      "error"
    );
    return;
  }

  if (
    roomIdValue &&
    (!Number.isSafeInteger(roomId) || roomId < 0)
  ) {
    setMessage(
      "addResidentMessage",
      "Room ID must be a whole number.",
      "error"
    );
    return;
  }

  if (
    campIdValue &&
    (!Number.isSafeInteger(campId) || campId < 0)
  ) {
    setMessage(
      "addResidentMessage",
      "Camp ID must be a whole number.",
      "error"
    );
    return;
  }

  const dateError = validateAccommodationDates(inDate, outDate);

  if (dateError) {
    setMessage("addResidentMessage", dateError, "error");
    return;
  }

  const submitButton = $("addResidentForm")?.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  try {
    // First create the resident.
    const { data: newResident, error: residentError } = await client
      .from("sam_residents")
      .insert({
        res_id: resId,
        first_name: firstName,
        last_name: lastName || null,
        room_number: roomNumber || null,
        room_id: roomId,
        camp_id: campId,
      })
      .select()
      .single();

    if (residentError) throw residentError;

    // Then create the associated booking.
    const { error: bookingError } = await client
      .from("sam_bookings")
      .insert({
        res_id: newResident.res_id,
        room_id: roomId,
        room_number: roomNumber || null,
        camp_id: campId,
        in_date: inDate,
        out_date: outDate,
        room_type: roomType || null,
        occupant: `${firstName} ${lastName}`.trim(),
      });

    if (bookingError) {
      setMessage(
        "addResidentMessage",
        "The resident was created, but the booking could not be saved: " +
          bookingError.message +
          ". The resident record remains in the database.",
        "error"
      );

      await loadResidents();
      return;
    }

    $("addResidentForm").reset();

    setMessage(
      "addResidentMessage",
      "Resident and booking added successfully.",
      "success"
    );

    await loadResidents();
  } catch (error) {
    console.error("Failed to add resident:", error);
    setMessage("addResidentMessage", error.message, "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// ============================================================
// 7. OPEN AND EDIT A BOOKING
// ============================================================

function openBookingEditor(resident, booking) {
  $("editBookingSection")?.classList.remove("hidden");

  $("editBookingId").value = booking.id;
  $("editInDate").value = booking.in_date || "";
  $("editOutDate").value = booking.out_date || "";
  $("editRoomType").value = booking.room_type || "";

  setMessage(
    "editBookingMessage",
    `Editing booking ${booking.id} for ` +
      `${resident.first_name} ${resident.last_name || ""}.`
  );

  $("editBookingSection")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function handleEditBooking(event) {
  event.preventDefault();
  clearMessage("editBookingMessage");

  const bookingIdValue = $("editBookingId")?.value;
  const inDate = $("editInDate")?.value;
  const outDate = $("editOutDate")?.value;
  const roomType = $("editRoomType")?.value.trim();

  const bookingId = Number(bookingIdValue);

  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    setMessage("editBookingMessage", "Invalid booking ID.", "error");
    return;
  }

  const dateError = validateAccommodationDates(inDate, outDate);

  if (dateError) {
    setMessage("editBookingMessage", dateError, "error");
    return;
  }

  const submitButton = $("editBookingForm")?.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  try {
    const { data, error } = await client
      .from("sam_bookings")
      .update({
        in_date: inDate,
        out_date: outDate,
        room_type: roomType || null,
      })
      .eq("id", bookingId)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      setMessage(
        "editBookingMessage",
        "Booking was not updated. Check your database permissions.",
        "error"
      );
      return;
    }

    setMessage(
      "editBookingMessage",
      "Booking updated successfully.",
      "success"
    );

    $("editBookingSection")?.classList.add("hidden");
    await loadResidents();
  } catch (error) {
    console.error("Failed to update booking:", error);
    setMessage("editBookingMessage", error.message, "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// ============================================================
// 8. DELETE A BOOKING ONLY
// ============================================================

async function deleteBooking(booking, resident) {
  setMessage("tableMessage", "Deleting booking...");

  try {
    const { data, error } = await client
      .from("sam_bookings")
      .delete()
      .eq("id", booking.id)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      setMessage(
        "tableMessage",
        "No booking was deleted. Check your database permissions.",
        "error"
      );
      return;
    }

    $("editBookingSection")?.classList.add("hidden");

    setMessage(
      "tableMessage",
      `Booking ${booking.id} for ${resident.first_name} deleted.`,
      "success"
    );

    await loadResidents();
  } catch (error) {
    console.error("Failed to delete booking:", error);
    setMessage("tableMessage", error.message, "error");
  }
}

// ============================================================
// 9. DELETE A RESIDENT AND ALL LINKED BOOKINGS
// ============================================================

async function deleteResident(resident) {
  setMessage("tableMessage", "Deleting resident and linked bookings...");

  try {
    const { data, error } = await client
      .from("sam_residents")
      .delete()
      .eq("res_id", resident.res_id)
      .select("res_id");

    if (error) throw error;

    if (!data || data.length === 0) {
      setMessage(
        "tableMessage",
        "No resident was deleted. Check your database permissions.",
        "error"
      );
      return;
    }

    // The database foreign key uses ON DELETE CASCADE, so linked
    // sam_bookings records are deleted automatically.
    $("editBookingSection")?.classList.add("hidden");

    setMessage(
      "tableMessage",
      `Resident ${resident.first_name} ${resident.last_name || ""} ` +
        "and all linked bookings deleted.",
      "success"
    );

    await loadResidents();
  } catch (error) {
    console.error("Failed to delete resident:", error);
    setMessage("tableMessage", error.message, "error");
  }
}

// ============================================================
// 10. CONNECT EVENT LISTENERS
// ============================================================

function initialiseApp() {
  $("loginForm")?.addEventListener("submit", handleLogin);

  $("logoutButton")?.addEventListener("click", handleLogout);

  $("refreshButton")?.addEventListener("click", loadResidents);

  $("searchInput")?.addEventListener("input", renderResidents);

  $("addResidentForm")?.addEventListener("submit", handleAddResident);

  $("editBookingForm")?.addEventListener("submit", handleEditBooking);

  // Optional close/cancel button for the booking editor.
  $("cancelEditButton")?.addEventListener("click", () => {
    $("editBookingSection")?.classList.add("hidden");
    clearMessage("editBookingMessage");
  });

  // Keep the UI aligned with Supabase authentication changes.
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;

    if (currentUser) {
      showDashboard();
      // Avoid doing additional auth operations inside this callback.
      setTimeout(() => loadResidents(), 0);
    } else {
      residents = [];
      bookings = [];
      $("residentTableBody")?.replaceChildren();
      $("editBookingSection")?.classList.add("hidden");
      showLogin();
    }
  });

  checkExistingSession();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiseApp);
} else {
  initialiseApp();
}

// // Replace these with your Supabase project details.
// // Use the publishable key, NOT the secret/service_role key.
// const SUPABASE_URL = "https://waqqjervkanalczfvons.supabase.co";
// const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_l8Er0zfUrzey07LOpQ7WFw_DWNcBzG0";

// const client = window.supabase.createClient(
//   SUPABASE_URL,
//   SUPABASE_PUBLISHABLE_KEY
// );

// const $ = (id) => document.getElementById(id);

// let residents = [];
// let bookings = [];

// function setMessage(id, message, type = "") {
//   $(id).textContent = message;
//   $(id).className = `message ${type}`;
// }

// function showLoggedIn() {
//   $("loginSection").classList.add("hidden");
//   $("dashboardSection").classList.remove("hidden");
//   $("logoutButton").classList.remove("hidden");
// }

// function showLoggedOut() {
//   $("loginSection").classList.remove("hidden");
//   $("dashboardSection").classList.add("hidden");
//   $("logoutButton").classList.add("hidden");
//   $("editBookingSection").classList.add("hidden");
//   residents = [];
//   bookings = [];
//   $("residentTableBody").replaceChildren();
//   $("residentCount").textContent = "0";
// }

// function nullableText(id) {
//   const value = $(id).value.trim();
//   return value || null;
// }

// function nullableNumber(id) {
//   const value = $(id).value.trim();
//   return value === "" ? null : Number(value);
// }

// function validDates(from, to) {
//   return Boolean(from && to && to > from);
// }

// function makeCell(value) {
//   const cell = document.createElement("td");
//   cell.textContent = value === null || value === undefined || value === ""
//     ? "—"
//     : String(value);
//   return cell;
// }

// // Login
// $("loginForm").addEventListener("submit", async (event) => {
//   event.preventDefault();
//   setMessage("loginMessage", "Signing in...");

//   try {
//     const { error } = await client.auth.signInWithPassword({
//       email: $("email").value.trim(),
//       password: $("password").value
//     });

//     if (error) throw error;

//     $("loginForm").reset();
//     showLoggedIn();
//     await loadResidents();
//   } catch (error) {
//     setMessage("loginMessage", error.message, "error");
//   }
// });

// // Restore session
// async function initialiseApp() {
//   const { data, error } = await client.auth.getSession();

//   if (error) {
//     setMessage("loginMessage", error.message, "error");
//     return;
//   }

//   if (data.session) {
//     showLoggedIn();
//     await loadResidents();
//   } else {
//     showLoggedOut();
//   }
// }

// $("logoutButton").addEventListener("click", async () => {
//   const { error } = await client.auth.signOut();

//   if (error) {
//     setMessage("tableMessage", error.message, "error");
//     return;
//   }

//   showLoggedOut();
// });

// // Load both tables independently
// async function loadResidents() {
//   setMessage("tableMessage", "Loading residents and bookings...");

//   try {
//     const [residentResult, bookingResult] = await Promise.all([
//       client.from("sam_residents")
//         .select("res_id, first_name, last_name, room_number, room_id, camp_id")
//         .order("res_id", { ascending: true }),

//       client.from("sam_bookings")
//         .select("id, res_id, room_id, room_number, in_date, out_date, camp_id, room_type")
//         .order("in_date", { ascending: false })
//     ]);

//     if (residentResult.error) throw residentResult.error;
//     if (bookingResult.error) throw bookingResult.error;

//     residents = residentResult.data || [];
//     bookings = bookingResult.data || [];

//     renderResidents();
//     setMessage("tableMessage", "");
//   } catch (error) {
//     setMessage("tableMessage", error.message, "error");
//   }
// }

// function renderResidents() {
//   const query = $("searchInput").value.trim().toLowerCase();
//   const rows = [];

//   for (const resident of residents) {
//     const residentBookings = bookings.filter(
//       (booking) => booking.res_id === resident.res_id
//     );

//     // Show residents even if they do not currently have a booking.
//     const rowsForResident = residentBookings.length
//       ? residentBookings
//       : [null];

//     for (const booking of rowsForResident) {
//       const searchable = [
//         resident.res_id,
//         resident.first_name,
//         resident.last_name,
//         resident.room_number,
//         resident.room_id,
//         resident.camp_id,
//         booking?.in_date,
//         booking?.out_date,
//         booking?.room_type
//       ].join(" ").toLowerCase();

//       if (!searchable.includes(query)) continue;

//       rows.push({ resident, booking });
//     }
//   }

//   const tbody = $("residentTableBody");
//   tbody.replaceChildren();

//   for (const { resident, booking } of rows) {
//     const row = document.createElement("tr");

//     row.append(
//       makeCell(resident.res_id),
//       makeCell(resident.first_name),
//       makeCell(resident.last_name),
//       makeCell(booking?.room_number ?? resident.room_number),
//       makeCell(booking?.room_id ?? resident.room_id),
//       makeCell(booking?.camp_id ?? resident.camp_id),
//       makeCell(booking?.in_date),
//       makeCell(booking?.out_date),
//       makeCell(booking?.room_type)
//     );

//     const actions = document.createElement("td");

//     if (booking) {
//       const editButton = document.createElement("button");
//       editButton.type = "button";
//       editButton.className = "button secondary";
//       editButton.textContent = "Edit booking";
//       editButton.addEventListener("click", () => {
//         openBookingEditor(resident, booking);
//       });
//       actions.appendChild(editButton);
//     } else {
//       actions.appendChild(document.createTextNode("No booking"));
//     }

//     row.appendChild(actions);
//     tbody.appendChild(row);
//   }

//   if (rows.length === 0) {
//     const row = document.createElement("tr");
//     const cell = makeCell("No matching residents or bookings found.");
//     cell.colSpan = 10;
//     row.appendChild(cell);
//     tbody.appendChild(row);
//   }

//   $("residentCount").textContent = String(residents.length);
// }

// $("searchInput").addEventListener("input", renderResidents);
// $("refreshButton").addEventListener("click", loadResidents);

// // Add resident plus their first booking
// $("addResidentForm").addEventListener("submit", async (event) => {
//   event.preventDefault();
//   const button = $("addResidentForm").querySelector('button[type="submit"]');
//   button.disabled = true;

//   const inDate = $("inDate").value;
//   const outDate = $("outDate").value;

//   if (!validDates(inDate, outDate)) {
//     setMessage("addMessage",
//       "The end date must be later than the start date.", "error");
//     button.disabled = false;
//     return;
//   }

//   const resident = {
//     res_id: Number($("resId").value),
//     first_name: $("firstName").value.trim(),
//     last_name: nullableText("lastName"),
//     room_number: nullableText("roomNumber"),
//     room_id: nullableNumber("roomId"),
//     camp_id: nullableNumber("campId")
//   };

//   const booking = {
//     res_id: resident.res_id,
//     room_number: resident.room_number,
//     room_id: resident.room_id,
//     camp_id: resident.camp_id,
//     in_date: inDate,
//     out_date: outDate,
//     room_type: $("roomType").value.trim(),
//     occupant: [resident.first_name, resident.last_name]
//       .filter(Boolean).join(" ")
//   };

//   try {
//     if (!Number.isSafeInteger(resident.res_id) || resident.res_id <= 0) {
//       throw new Error("Enter a valid positive Resident ID.");
//     }

//     if (!resident.first_name || !booking.room_type) {
//       throw new Error("First name and room type are required.");
//     }

//     const { error: residentError } = await client
//       .from("sam_residents")
//       .insert([resident]);

//     if (residentError) throw residentError;

//     const { error: bookingError } = await client
//       .from("sam_bookings")
//       .insert([booking]);

//     if (bookingError) {
//       setMessage("addMessage",
//         "The resident was created, but the booking failed: " +
//         bookingError.message +
//         ". Add the booking separately or remove the test resident if appropriate.",
//         "error");
//       await loadResidents();
//       return;
//     }

//     $("addResidentForm").reset();
//     setMessage("addMessage",
//       "Resident and accommodation booking added successfully.", "success");
//     await loadResidents();
//   } catch (error) {
//     setMessage("addMessage", error.message, "error");
//   } finally {
//     button.disabled = false;
//   }
// });

// // Open the editor for a specific booking
// function openBookingEditor(resident, booking) {
//   $("editBookingId").value = booking.id;
//   $("editInDate").value = booking.in_date || "";
//   $("editOutDate").value = booking.out_date || "";
//   $("editRoomType").value = booking.room_type || "";
//   $("editBookingSubtitle").textContent =
//     `${resident.first_name} ${resident.last_name || ""} — ` +
//     `Resident ID ${resident.res_id}, booking ID ${booking.id}`;

//   setMessage("editMessage", "");
//   $("editBookingSection").classList.remove("hidden");
//   $("editBookingSection").scrollIntoView({ behavior: "smooth" });
// }

// $("cancelEditButton").addEventListener("click", () => {
//   $("editBookingSection").classList.add("hidden");
//   $("editBookingForm").reset();
// });

// // Update the selected booking, not every booking for the resident
// $("editBookingForm").addEventListener("submit", async (event) => {
//   event.preventDefault();

//   const inDate = $("editInDate").value;
//   const outDate = $("editOutDate").value;
//   const roomType = $("editRoomType").value.trim();

//   if (!validDates(inDate, outDate)) {
//     setMessage("editMessage",
//       "The end date must be later than the start date.", "error");
//     return;
//   }

//   if (!roomType) {
//     setMessage("editMessage", "Room type is required.", "error");
//     return;
//   }

//   const bookingId = Number($("editBookingId").value);
//   const button = $("editBookingForm").querySelector('button[type="submit"]');
//   button.disabled = true;
//   setMessage("editMessage", "Saving changes...");

//   try {
//     const { data, error } = await client
//       .from("sam_bookings")
//       .update({
//         in_date: inDate,
//         out_date: outDate,
//         room_type: roomType
//       })
//       .eq("id", bookingId)
//       .select("id");

//     if (error) throw error;
//     if (!data || data.length === 0) {
//       throw new Error("No booking was updated. Check your database permissions.");
//     }

//     setMessage("editMessage", "Booking updated successfully.", "success");
//     await loadResidents();
//   } catch (error) {
//     setMessage("editMessage", error.message, "error");
//   } finally {
//     button.disabled = false;
//   }
// });

// initialiseApp();