export interface JMAPSession {
  capabilities: Record<string, unknown>
  accounts: Record<string, JMAPAccount>
  primaryAccounts: Record<string, string>
  username: string
  apiUrl: string
  downloadUrl: string
  uploadUrl: string
  eventSourceUrl: string
  state: string
}

export interface JMAPAccount {
  name: string
  isPersonal: boolean
  isReadOnly: boolean
  accountCapabilities: Record<string, unknown>
}

export interface JMAPMethodCall {
  name: string
  args: Record<string, unknown>
  clientId: string
}

export interface JMAPRequest {
  using: string[]
  methodCalls: [string, Record<string, unknown>, string][]
}

export interface JMAPResponse {
  methodResponses: [string, Record<string, unknown>, string][]
  sessionState: string
}

export interface ResultReference {
  resultOf: string
  name: string
  path: string
}

export interface Mailbox {
  id: string
  name: string
  parentId: string | null
  role: string | null
  sortOrder: number
  totalEmails: number
  unreadEmails: number
  totalThreads: number
  unreadThreads: number
  isSubscribed: boolean
}

export interface EmailAddress {
  name: string | null
  email: string
}

export interface EmailHeader {
  name: string
  value: string
}

export interface EmailBodyPart {
  partId: string | null
  blobId: string | null
  size: number
  name: string | null
  type: string
  charset: string | null
  disposition: string | null
  cid: string | null
  subParts: EmailBodyPart[] | null
}

export interface EmailBodyValue {
  value: string
  isEncodingProblem: boolean
  isTruncated: boolean
}

export interface EmailMessage {
  id: string
  blobId: string
  threadId: string
  mailboxIds: Record<string, boolean>
  keywords: Record<string, boolean>
  size: number
  receivedAt: string
  messageId: string[] | null
  inReplyTo: string[] | null
  references: string[] | null
  sender: EmailAddress[] | null
  from: EmailAddress[] | null
  to: EmailAddress[] | null
  cc: EmailAddress[] | null
  bcc: EmailAddress[] | null
  replyTo: EmailAddress[] | null
  subject: string | null
  sentAt: string | null
  hasAttachment: boolean
  preview: string
  bodyStructure?: EmailBodyPart
  bodyValues?: Record<string, EmailBodyValue>
  textBody?: EmailBodyPart[]
  htmlBody?: EmailBodyPart[]
  attachments?: EmailBodyPart[]
}

export interface EmailSetError {
  type: string
  description?: string
}

export interface EmailSetResponse {
  accountId: string
  oldState: string | null
  newState: string
  updated?: Record<string, unknown> | null
  destroyed?: string[] | null
  notUpdated?: Record<string, EmailSetError> | null
  notDestroyed?: Record<string, EmailSetError> | null
}

export type EmailUpdate = Record<string, Record<string, unknown>>

const JMAP_CAPABILITIES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"]

const FASTMAIL_SESSION_URL = "https://api.fastmail.com/jmap/session"

export class JMAPClient {
  private accessToken: string
  private session: JMAPSession | null = null
  private accountId: string | null = null

  constructor(accessToken?: string) {
    const token = accessToken ?? Bun.env.FASTMAIL_API_TOKEN
    if (!token) {
      throw new Error(
        "FASTMAIL_API_TOKEN environment variable is required, or pass accessToken to constructor",
      )
    }
    this.accessToken = token
  }

  /** Get the current session, fetching if needed */
  async getSession(): Promise<JMAPSession> {
    if (this.session) {
      return this.session
    }

    const response = await fetch(FASTMAIL_SESSION_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get JMAP session: ${response.status} ${response.statusText}`)
    }

    this.session = (await response.json()) as JMAPSession
    return this.session
  }

  /** Get the primary mail account ID */
  async getAccountId(): Promise<string> {
    if (this.accountId) {
      return this.accountId
    }

    const session = await this.getSession()
    const mailAccountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]

    if (!mailAccountId) {
      throw new Error("No primary mail account found in session")
    }

    this.accountId = mailAccountId
    return mailAccountId
  }

  /** Get the API URL from the session */
  async getApiUrl(): Promise<string> {
    const session = await this.getSession()
    return session.apiUrl
  }

  /**
   * Execute JMAP method calls.
   * Supports batching multiple calls and back-references.
   */
  async execute(methodCalls: JMAPMethodCall[]): Promise<JMAPResponse> {
    const apiUrl = await this.getApiUrl()

    const request: JMAPRequest = {
      using: JMAP_CAPABILITIES,
      methodCalls: methodCalls.map((call) => [call.name, call.args, call.clientId]),
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`JMAP request failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as JMAPResponse
  }

  /**
   * Helper to create a back-reference to a previous method call's result.
   * Use this to chain method calls efficiently.
   *
   * @example
   * // Reference the "ids" from a previous query
   * client.ref("query0", "Email/query", "/ids")
   */
  ref(resultOf: string, name: string, path: string): ResultReference {
    return { resultOf, name, path }
  }

  /**
   * Extract the result of a specific method call from a response.
   */
  getResult<T>(response: JMAPResponse, clientId: string): T | null {
    const methodResponse = response.methodResponses.find(([, , id]) => id === clientId)
    if (!methodResponse) {
      return null
    }
    return methodResponse[1] as T
  }

  /**
   * Check if a method call resulted in an error.
   */
  isError(response: JMAPResponse, clientId: string): boolean {
    const methodResponse = response.methodResponses.find(([, , id]) => id === clientId)
    if (!methodResponse) {
      return false
    }
    return methodResponse[0] === "error"
  }

  /**
   * Get error details for a method call.
   */
  getError(
    response: JMAPResponse,
    clientId: string,
  ): { type: string; description?: string } | null {
    const methodResponse = response.methodResponses.find(([, , id]) => id === clientId)
    if (!methodResponse || methodResponse[0] !== "error") {
      return null
    }
    return methodResponse[1] as { type: string; description?: string }
  }
}

let defaultClient: JMAPClient | null = null

/**
 * Get the default JMAP client instance.
 * Uses FASTMAIL_API_TOKEN from environment.
 */
export function getClient(): JMAPClient {
  if (!defaultClient) {
    defaultClient = new JMAPClient()
  }
  return defaultClient
}

/**
 * Create a new JMAP client with a specific access token.
 */
export function createClient(accessToken: string): JMAPClient {
  return new JMAPClient(accessToken)
}

export async function executeEmailUpdate({
  clientId,
  update,
  errorMessage,
  emailId,
}: {
  clientId: string
  update: EmailUpdate
  errorMessage: string
  emailId?: string
}): Promise<EmailSetResponse | null> {
  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/set",
      args: {
        accountId,
        update,
      },
      clientId,
    },
  ])

  if (client.isError(response, clientId)) {
    const error = client.getError(response, clientId)
    throw new Error(`${errorMessage}: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailSetResponse>(response, clientId)
  if (emailId && result?.notUpdated?.[emailId]) {
    const updateError = result.notUpdated[emailId]
    throw new Error(`${errorMessage}: ${updateError.type} - ${updateError.description}`)
  }

  return result
}

export async function executeEmailDestroy({
  clientId,
  destroy,
  errorMessage,
  emailId,
}: {
  clientId: string
  destroy: string[]
  errorMessage: string
  emailId?: string
}): Promise<EmailSetResponse | null> {
  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/set",
      args: {
        accountId,
        destroy,
      },
      clientId,
    },
  ])

  if (client.isError(response, clientId)) {
    const error = client.getError(response, clientId)
    throw new Error(`${errorMessage}: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailSetResponse>(response, clientId)
  if (emailId && result?.notDestroyed?.[emailId]) {
    const destroyError = result.notDestroyed[emailId]
    throw new Error(`${errorMessage}: ${destroyError.type} - ${destroyError.description}`)
  }

  return result
}
