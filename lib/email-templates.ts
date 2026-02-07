import "server-only";

type SessionDetails = {
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
};

type SignupStatus = "signed_up" | "waiting_list";

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

  const text = [
    `Hi ${args.name || "there"},`,
    "",
    `Session: ${args.session.name}`,
    `When: ${when}`,
    notes,
    "",
    statusLine,
    firstTimeLine,
    "",
    "If you need to cancel, use this link:",
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
      <p>If you need to cancel, use this link:<br/>
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
}) {
  const when = formatSessionTime(args.session);
  const subject = `You are in: ${args.session.name}`;

  const text = [
    `Hi ${args.name || "there"},`,
    "",
    "Good news! A spot opened up and you have been moved from the waitlist.",
    "",
    `When: ${when}`,
    args.session.notes ? `Notes: ${args.session.notes}` : "",
    "",
    "If you need to cancel, use this link:",
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
      <p>If you need to cancel, use this link:<br/>
      <a href="${args.cancelUrl}">${args.cancelUrl}</a></p>
    </div>
  `;

  return { subject, text, html };
}
