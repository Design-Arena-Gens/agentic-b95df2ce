'use client';

import { FormEvent, useMemo, useRef, useState } from "react";

type Sender = "assistant" | "user";

interface Message {
  id: string;
  sender: Sender;
  text: string;
}

type BookingField =
  | "name"
  | "occasion"
  | "dateTime"
  | "guestCount"
  | "decoration"
  | "contact";

interface BookingState {
  name?: string;
  occasion?: string;
  dateTime?: string;
  guestCount?: number;
  decoration?: "yes" | "no";
  contact?: string;
  bookingComplete: boolean;
}

const QUESTIONS: Record<BookingField, string> = {
  name: "May I know your name, please?",
  occasion:
    "What are you celebrating? (Birthday, Baby Shower, Engagement, Anniversary, Corporate, or something else?)",
  dateTime: "Which date and preferred time slot would you like?",
  guestCount: "How many guests are you expecting?",
  decoration: "Do you need us to arrange decoration as well? (Yes/No)",
  contact: "Could you share a contact number so I can reach you quickly if needed?"
};

const OCCASION_MATCHERS = [
  { value: "Birthday", keywords: ["birthday", "bday", "turning"] },
  { value: "Baby Shower", keywords: ["baby shower", "shower"] },
  { value: "Engagement", keywords: ["engagement"] },
  { value: "Anniversary", keywords: ["anniversary"] },
  { value: "Corporate", keywords: ["corporate", "office", "team", "offsite"] },
  { value: "Other", keywords: ["wedding", "farewell", "meet", "gathering"] }
];

const VENUE_PREVIEW_URL =
  "https://happyhearts.events/preview?utm_source=assistant";

const initialState: BookingState = {
  bookingComplete: false
};

const initialMessages: Message[] = [
  {
    id: "m-0",
    sender: "assistant",
    text:
      "Hello! I'm the HappyHearts WhatsApp Assistant. I'd be delighted to help you plan at HAPPY HEARTS – An Event Space. To get started, could you tell me your name?"
  }
];

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [bookingState, setBookingState] = useState<BookingState>(initialState);
  const [input, setInput] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const lastAssistantMessage = useMemo(
    () => messages.filter((m) => m.sender === "assistant").at(-1)?.text ?? "",
    [messages]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: trimmed
    };

    const { responses, state: nextState } = handleAssistantTurn(
      bookingState,
      trimmed,
      lastAssistantMessage
    );

    setMessages((prev) => [
      ...prev,
      userMessage,
      ...responses.map((text, index) => ({
        id: `a-${Date.now()}-${index}`,
        sender: "assistant" as const,
        text
      }))
    ]);
    setBookingState(nextState);
    setInput("");
    formRef.current?.reset();
  };

  return (
    <main className="app-shell">
      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <h1>HappyHearts Assistant</h1>
            <p>
              Fast, friendly booking support for HAPPY HEARTS – An Event Space.
            </p>
          </div>
        </header>

        <div className="chat-feed" role="log" aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message ${message.sender}`}
              data-sender={message.sender}
            >
              {message.text}
            </article>
          ))}
        </div>

        <form ref={formRef} className="input-bar" onSubmit={handleSubmit}>
          <textarea
            placeholder="Type your message…"
            required
            maxLength={400}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

function handleAssistantTurn(
  previousState: BookingState,
  message: string,
  lastAssistantText: string
) {
  const normalized = message.toLowerCase();
  const updated = extractBookingDetails(message, previousState);
  const responses: string[] = [];

  if (containsMediaRequest(normalized)) {
    responses.push(
      `Here is our venue preview: ${VENUE_PREVIEW_URL}`
    );
  }

  const missingField = getNextMissingField(updated);

  if (
    containsPriceQuestion(normalized) &&
    (!updated.dateTime || !updated.guestCount)
  ) {
    responses.push(
      "Our pricing depends on date, timing & guest count. I can give an exact quote once I have these 3 details."
    );
    if (missingField) {
      responses.push(personalizedPrompt(missingField, updated));
    }
    return {
      responses: ensureMinimumResponse(responses, updated, lastAssistantText),
      state: updated
    };
  }

  if (!missingField && !updated.bookingComplete) {
    responses.push(buildConfirmationMessage(updated));
    updated.bookingComplete = true;
    return {
      responses,
      state: updated
    };
  }

  if (missingField) {
    responses.push(personalizedPrompt(missingField, updated));
  }

  return {
    responses: ensureMinimumResponse(responses, updated, lastAssistantText),
    state: updated
  };
}

function ensureMinimumResponse(
  responses: string[],
  state: BookingState,
  lastAssistantText: string
) {
  if (responses.length > 0) return responses;

  if (state.bookingComplete) {
    return [
      "Happy to help with anything else you need—just let me know!"
    ];
  }

  if (lastAssistantText.includes("something else you need")) {
    return [
      "I can assist with any other questions or special requests too."
    ];
  }

  return [
    "Thanks for the details! Let me know the remaining information so I can keep everything moving for you."
  ];
}

function extractBookingDetails(
  message: string,
  state: BookingState
): BookingState {
  const normalized = message.toLowerCase();
  let next: BookingState = { ...state };

  if (!next.name) {
    const nameMatch =
      message.match(/(?:name is|this is|i am|i'm)\s+([a-z\s]+)/i)?.[1] ??
      message.match(/^[a-z][a-z\s]{1,30}$/i)?.[0];
    if (nameMatch) {
      next = { ...next, name: formatName(nameMatch) };
    }
  }

  if (!next.occasion) {
    const foundOccasion = OCCASION_MATCHERS.find(({ keywords }) =>
      keywords.some((keyword) => normalized.includes(keyword))
    );
    if (foundOccasion) {
      next = { ...next, occasion: foundOccasion.value };
    } else if (normalized.includes("other")) {
      next = { ...next, occasion: "Other" };
    }
  }

  if (!next.dateTime) {
    const datePattern =
      /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/;
    const timePattern =
      /\b(\d{1,2}(:\d{2})?\s*(?:am|pm))\b|morning|evening|night|afternoon|noon|slot/;

    const dateMatch = message.match(datePattern);
    const timeMatch = message.match(timePattern);

    if (dateMatch) {
      const datePart = dateMatch[0];
      let timePart = "";

      if (timeMatch) {
        const raw = timeMatch[0];
        timePart =
          ["morning", "evening", "night", "afternoon", "noon", "slot"].includes(
            raw.toLowerCase()
          ) && !/\d/.test(raw)
            ? raw.toLowerCase()
            : raw;
      }

      next = {
        ...next,
        dateTime: [datePart, timePart].filter(Boolean).join(" ").trim()
      };
    } else if (
      normalized.includes("tomorrow") ||
      normalized.includes("weekend")
    ) {
      next = {
        ...next,
        dateTime: message.trim()
      };
    }
  }

  if (!next.guestCount) {
    const guestMatch = normalized.match(
      /(?:for|about|around)?\s*(\d{2,3})\s*(?:guests?|people|pax|heads|persons?)/
    );
    if (guestMatch) {
      next = { ...next, guestCount: Number.parseInt(guestMatch[1], 10) };
    }
  }

  if (!next.decoration) {
    if (normalized.includes("no decor") || normalized.includes("no decoration")) {
      next = { ...next, decoration: "no" };
    } else if (normalized.includes("decor") || normalized.includes("decoration")) {
      const yesNoMatch = normalized.match(/decor(?:ation)?\s*(yes|no)/);
      if (yesNoMatch) {
        next = { ...next, decoration: yesNoMatch[1] === "yes" ? "yes" : "no" };
      } else if (normalized.includes("decor") || normalized.includes("theme")) {
        next = { ...next, decoration: "yes" };
      }
    } else if (normalized.includes("yes decoration")) {
      next = { ...next, decoration: "yes" };
    }
  }

  if (!next.contact) {
    const contactMatch = message.match(/\+?\d[\d\s-]{8,}/);
    if (contactMatch) {
      const compact = contactMatch[0].replace(/[^\d+]/g, "");
      if (compact.replace(/\D/g, "").length >= 9) {
        next = { ...next, contact: compact };
      }
    }
  }

  return next;
}

function containsMediaRequest(message: string) {
  return (
    message.includes("photo") ||
    message.includes("video") ||
    message.includes("pictures") ||
    message.includes("pics") ||
    message.includes("images")
  );
}

function containsPriceQuestion(message: string) {
  return (
    message.includes("price") ||
    message.includes("charges") ||
    message.includes("rate") ||
    message.includes("cost")
  );
}

function getNextMissingField(state: BookingState): BookingField | null {
  const order: BookingField[] = [
    "name",
    "occasion",
    "dateTime",
    "guestCount",
    "decoration",
    "contact"
  ];

  for (const field of order) {
    if (state[field] === undefined) {
      return field;
    }
  }

  return null;
}

function personalizedPrompt(field: BookingField, state: BookingState) {
  const basePrompt = QUESTIONS[field];
  if (field === "guestCount" && state.name) {
    return `Thanks, ${state.name.split(" ")[0]}! ${basePrompt}`;
  }

  if (field === "dateTime" && state.occasion) {
    return `${state.occasion} sounds lovely! ${basePrompt}`;
  }

  if (field === "decoration" && state.occasion) {
    return `Would you like us to style ${state.occasion.toLowerCase()} decor? Please let me know Yes or No.`;
  }

  return basePrompt;
}

function buildConfirmationMessage(state: BookingState) {
  const firstName = state.name?.split(" ")[0] ?? "there";
  const guestCount = state.guestCount ?? 0;
  const basePrice = 18000;
  const perGuest = 250;
  const variableGuests = Math.max(guestCount - 60, 0);
  const low = basePrice + Math.max(guestCount - 40, 0) * 150;
  const high = low + variableGuests * perGuest + 6000;

  const priceLine =
    guestCount > 0
      ? `For a guest list of around ${guestCount}, our packages typically range between Rs. ${formatAmount(
          low
        )} and Rs. ${formatAmount(high)} depending on final setup and services.`
      : "Our packages are flexible, and I can tailor the pricing once we finalise the guest count.";

  const decorLine =
    state.decoration === "yes"
      ? "We will include a decor briefing so the theme feels just right."
      : "We can keep the space ready for your own decor team, or arrange decor later if you change your mind.";

  return [
    `Wonderful, ${firstName}! HAPPY HEARTS is available on ${state.dateTime}.`,
    priceLine,
    "What is included: 4-hour exclusive hall access, lounge seating with premium linens, ambient lighting, plug-and-play sound system, on-site event coordinator, and housekeeping support.",
    decorLine,
    "To lock in your booking we take a Rs. 10,000 advance (UPI or bank transfer) with the balance due on the event day.",
    "Let me know if you'd like me to reserve the slot or help with any custom requests."
  ].join("\n\n");
}

function formatAmount(value: number) {
  return value.toLocaleString("en-IN");
}

function formatName(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
