import type { Outcome } from "../api/types";

export const participants = ["Sarah Lim", "Daniel Wong", "Rachel Koh"] as const;
export const recipientsFor = (sender: string) =>
  participants.filter((name) => name !== sender);
// Keep the current recipient unless it just became the sender.
export const recipientAfterSenderChange = (
  sender: string,
  recipient: string,
) => (recipient === sender ? recipientsFor(sender)[0] : recipient);

type Party = { from: string; to: string; amount: string };
export type Scenario = {
  id: Outcome;
  name: string;
  summary: string;
  // Plain paragraphs, shown in order under the selected scenario.
  explanation: (party: Party) => string[];
};
export const scenarios: Scenario[] = [
  {
    id: "SUCCESS",
    name: "Approved payment",
    summary: "The network approves the payment.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The platform passes the payment to the network and the network approves it.`,
      `The platform records SUCCEEDED and posts a journal entry to the ledger. This is the expected outcome.`,
    ],
  },
  {
    id: "DECLINED",
    name: "Declined payment",
    summary: "The network declines the payment.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount} and the network declines it. A decline is final, so no money is transferred. This happens for reasons such as insufficient funds.`,
      `The platform records FAILED and posts nothing to the ledger.`,
    ],
  },
  {
    id: "TIMEOUT_AFTER_SUCCESS",
    name: "Response lost",
    summary: "The payment is made, but the response never arrives.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The network approves it and moves the money, but its reply never arrives, so the platform cannot tell if the payment happened.`,
      `It records UNKNOWN and does not send again, because ${to} could be paid twice. Instead it reconciles, asking the network what happened to this payment using its reference ID.`,
      `In this scenario the network answers that it was approved, so the platform records SUCCEEDED.`,
    ],
  },
  {
    id: "TIMEOUT_BEFORE_PROCESSING",
    name: "Request lost",
    summary: "The request never reaches the network.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}, but the request is lost before it reaches the network, so no money is transferred. The platform gets no reply and records UNKNOWN.`,
      `It then asks the network about the payment using its reference ID. The network has no record of it, so the platform knows nothing was paid.`,
      `The platform sends the request again with the same reference ID, so the network treats it as the same payment.`,
    ],
  },
  {
    id: "PENDING",
    name: "Pending payment",
    summary: "The network has not finished processing the payment.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The network accepts the request but replies that the payment is still being processed.`,
      `The platform cannot record SUCCEEDED or FAILED yet, because a wrong guess means a lost payment or a double payment. It records UNKNOWN, waits briefly and checks again.`,
      `In this scenario the network then reports approval and the platform records SUCCEEDED. A decline would be recorded as FAILED.`,
    ],
  },
  {
    id: "UNKNOWN",
    name: "Unknown outcome",
    summary: "The network cannot report a result.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The network cannot report a result, and still cannot when the platform checks again.`,
      `The platform cannot tell whether the payment happened, and guessing wrong means paying twice or never paying. So it keeps the payment as UNKNOWN, posts nothing to the ledger and does not resend it.`,
      `In this scenario the network never reports a result, so the payment stays UNKNOWN. A real network's settlement report, a list of every payment it processed, would settle it.`,
    ],
  },
];
