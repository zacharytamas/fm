import type { EmailAddress, EmailMessage } from "./tools"

/**
 * Returns a predicate that checks if a message is older than a given number of days
 * @param days - The number of days to check
 * @returns A predicate function that checks if a message is older than the given number of days
 */
export const olderThan = (days: number): ((message: EmailMessage) => boolean) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return (message: EmailMessage): boolean => new Date(message.receivedAt) < cutoff
}

/**
 * Returns a predicate that checks if a message is from a given email address
 * @param email - The email address to check (can be a substring)
 * @returns A predicate function that checks if a message is from the given email address (substring match)
 */
export const fromIncludes =
  (email: string): ((message: EmailMessage) => boolean) =>
  (message: EmailMessage): boolean =>
    message.from?.some((from) => from.email.includes(email)) ?? false

/**
 * A helper pipe function that accepts a variadic number of predicates and returns a new predicate that is the logical OR of the given predicates
 * @param predicates - The predicates to pipe
 * @returns A new predicate that is the logical OR of the given predicates
 */
export const or =
  (...predicates: ((message: EmailMessage) => boolean)[]): ((message: EmailMessage) => boolean) =>
  (message: EmailMessage): boolean =>
    predicates.some((predicate) => predicate(message))

export const formatRecipientList = (recipients: EmailAddress[] | null): string =>
  recipients?.map((recipient) => `${recipient.name ?? ""} <${recipient.email}>`).join(", ") ??
  "Unknown"
