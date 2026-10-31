type SessionDetails = {
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
};

type SignupStatus = "signed_up" | "waiting_list";

export type WeeklyCredits = { weeklyQuota: number; usedCredits: number; remainingCredits: number };

function creditMessage(credits: WeeklyCredits | null | undefined) {
  if (!credits) return "";
  const count = `Weekly booking credits for the week you booked: ${credits.usedCredits} of ${credits.weeklyQuota} reserved or spent, ${credits.remainingCredits} available. Booking weeks reset Monday (UK time).`;
  const exhausted = credits.remainingCredits === 0
    ? " You have no booking credits available for that booking week."
    : "";
  return count + exhausted;
}

function formatSessionTime(session: SessionDetails) {
  if (!session.starts_at) return "Time to be confirmed";
  const start = new Date(session.starts_at);
  const end = session.ends_at ? new Date(session.ends_at) : null;
  const day = start.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
  const startTime = start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  const endTime = end
    ? end.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "";
  return endTime ? `${day} ${startTime} to ${endTime}` : `${day} ${startTime}`;
}

export function buildSignupEmail(args: {
  name: string;
  email: string;
  status: SignupStatus;
  session: SessionDetails;
  cancelUrl: string;
  isFirstTimeTaster?: boolean;
  credits?: WeeklyCredits | null;
}) {
  const statusLine =
    args.status === "signed_up"
      ? "You are confirmed for this session."
      : "You are currently on the waitlist for this session.";
  const subject =
    args.status === "signed_up"
      ? `Booking confirmed: ${args.session.name}`
      : `Waitlist confirmed: ${args.session.name}`;
  const when = formatSessionTime(args.session);
  const notes = args.session.notes ? `Notes: ${args.session.notes}` : "";
  const firstTimeLine = args.isFirstTimeTaster
    ? "This was your first booking without membership (taster). Next time you will need paid membership to book regular member sessions."
    : "";
  const creditActionLine = args.status === "signed_up"
    ? "Your confirmed place reserves one weekly booking credit now. Cancel before the session starts to return it; once the session starts, it is spent."
    : "Your waitlist place does not reserve a credit. One will be reserved if you are promoted to a confirmed place.";
  const creditsLine = args.isFirstTimeTaster ? "" : creditMessage(args.credits);
  const bookingCreditLine = args.isFirstTimeTaster ? "" : creditActionLine;

  const text = [
    `Hi ${args.name || "there"},`,
    "",
    `Session: ${args.session.name}`,
    `When: ${when}`,
    notes,
    "",
    statusLine,
    firstTimeLine,
    bookingCreditLine,
    creditsLine,
    "",
    "To cancel before the session starts, use this link:",
    args.cancelUrl,
    "",
    "See you soon!",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p>Hi ${args.name || "there"},</p>
      <p><strong>Session:</strong> ${args.session.name}<br/>
      <strong>When:</strong> ${when}</p>
      ${args.session.notes ? `<p><strong>Notes:</strong> ${args.session.notes}</p>` : ""}
      <p>${statusLine}</p>
      ${args.isFirstTimeTaster ? `<p><strong>First-time booking:</strong> This was your taster booking without membership. Next time you will need paid membership to book regular member sessions.</p>` : ""}
      ${bookingCreditLine ? `<p>${bookingCreditLine}</p>` : ""}
      ${creditsLine ? `<p>${creditsLine}</p>` : ""}
      <p>To cancel before the session starts, use this link:<br/>
      <a href="${args.cancelUrl}">${args.cancelUrl}</a></p>
      <p>See you soon!</p>
    </div>
  `;

  return { subject, text, html };
}

export function buildPromotionEmail(args: {
  name: string;
  session: SessionDetails;
  cancelUrl: string;
  isFirstTimeTaster?: boolean;
  credits?: WeeklyCredits | null;
}) {
  const when = formatSessionTime(args.session);
  const subject = `You are in: ${args.session.name}`;
  const creditsLine = args.isFirstTimeTaster ? "" : creditMessage(args.credits);
  const creditActionLine = args.isFirstTimeTaster ? "" : "One weekly booking credit is now reserved for your confirmed place. Cancel before the session starts to return it; once the session starts, it is spent.";

  const text = [
    `Hi ${args.name || "there"},`,
    "",
    "Good news! A spot opened up and you have been moved from the waitlist.",
    "",
    `When: ${when}`,
    args.session.notes ? `Notes: ${args.session.notes}` : "",
    creditActionLine,
    creditsLine,
    "",
    "To cancel before the session starts, use this link:",
    args.cancelUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p>Hi ${args.name || "there"},</p>
      <p>Good news! A spot opened up and you have been moved from the waitlist.</p>
      <p><strong>Session:</strong> ${args.session.name}<br/>
      <strong>When:</strong> ${when}</p>
      ${args.session.notes ? `<p><strong>Notes:</strong> ${args.session.notes}</p>` : ""}
      ${creditActionLine ? `<p>${creditActionLine}</p>` : ""}
      ${creditsLine ? `<p>${creditsLine}</p>` : ""}
      <p>To cancel before the session starts, use this link:<br/>
      <a href="${args.cancelUrl}">${args.cancelUrl}</a></p>
    </div>
  `;

  return { subject, text, html };
}

export function buildCancellationEmail(args: {
  name: string;
  session: SessionDetails;
  previousStatus?: SignupStatus;
  source: "user_cancelled" | "admin_removed";
  isFirstTimeTaster?: boolean;
  creditReturned?: boolean;
  credits?: WeeklyCredits | null;
}) {
  const when = formatSessionTime(args.session);
  const wasWaitlist = args.previousStatus === "waiting_list";
  const subject = wasWaitlist
    ? `Waitlist removed: ${args.session.name}`
    : `Booking cancelled: ${args.session.name}`;
  const actionLine =
    args.source === "admin_removed"
      ? wasWaitlist
        ? "You have been removed from the waitlist for this session by the committee."
        : "Your booking for this session has been removed by the committee."
      : wasWaitlist
        ? "You have cancelled your waitlist place for this session."
        : "Your booking for this session has been cancelled.";
  const creditsLine = args.isFirstTimeTaster ? "" : creditMessage(args.credits);
  const creditActionLine = args.isFirstTimeTaster ? "" : args.creditReturned === false
    ? "The session had already started, so its booking credit remains spent and was not returned."
    : wasWaitlist
      ? "Your waitlist place did not reserve a booking credit."
      : "The credit reserved for this booking has been returned to the week you booked.";

  const text = [
    `Hi ${args.name || "there"},`,
    "",
    actionLine,
    "",
    `Session: ${args.session.name}`,
    `When: ${when}`,
    args.session.notes ? `Notes: ${args.session.notes}` : "",
    creditActionLine,
    creditsLine,
    "",
    "If this does not look right, please contact the committee.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p>Hi ${args.name || "there"},</p>
      <p>${actionLine}</p>
      <p><strong>Session:</strong> ${args.session.name}<br/>
      <strong>When:</strong> ${when}</p>
      ${args.session.notes ? `<p><strong>Notes:</strong> ${args.session.notes}</p>` : ""}
      ${creditActionLine ? `<p>${creditActionLine}</p>` : ""}
      ${creditsLine ? `<p>${creditsLine}</p>` : ""}
      <p>If this does not look right, please contact the committee.</p>
    </div>
  `;

  return { subject, text, html };
}
