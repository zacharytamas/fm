import { mock } from "bun:test"
import type { JMAPResponse, JMAPSession } from "./shared.ts"

export const TEST_ACCOUNT_ID = "u1234567"
export const TEST_API_URL = "https://api.fastmail.com/jmap/api/"

export const mockSession: JMAPSession = {
  capabilities: {
    "urn:ietf:params:jmap:core": {},
    "urn:ietf:params:jmap:mail": {},
  },
  accounts: {
    [TEST_ACCOUNT_ID]: {
      name: "test@example.com",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {},
    },
  },
  primaryAccounts: {
    "urn:ietf:params:jmap:mail": TEST_ACCOUNT_ID,
  },
  username: "test@example.com",
  apiUrl: TEST_API_URL,
  downloadUrl: "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}",
  uploadUrl: "https://api.fastmail.com/jmap/upload/{accountId}/",
  eventSourceUrl: "https://api.fastmail.com/jmap/eventsource/",
  state: "session-state-123",
}

export interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

export function createMockFetch(options: { session?: JMAPSession; apiResponses?: JMAPResponse[] }) {
  const { session = mockSession, apiResponses = [] } = options
  const capturedRequests: CapturedRequest[] = []
  let apiCallIndex = 0

  const mockFetchImpl = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlString = url.toString()
    const method = init?.method ?? "GET"
    const headers: Record<string, string> = {}

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(init.headers)) {
        for (const entry of init.headers) {
          const key = entry[0]
          const value = entry[1]
          if (key !== undefined && value !== undefined) {
            headers[key] = value
          }
        }
      } else {
        Object.assign(headers, init.headers)
      }
    }

    let body: unknown = null
    if (init?.body) {
      body = JSON.parse(init.body as string)
    }

    capturedRequests.push({ url: urlString, method, headers, body })

    if (urlString.includes("/jmap/session")) {
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (urlString === TEST_API_URL || urlString.includes("/jmap/api")) {
      const response = apiResponses[apiCallIndex] ?? {
        methodResponses: [],
        sessionState: "state-123",
      }
      apiCallIndex++
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response("Not Found", { status: 404 })
  }

  const mockFetch = mock(mockFetchImpl) as unknown as typeof fetch

  return { mockFetch, capturedRequests }
}

export function createSuccessResponse(
  methodResponses: [string, Record<string, unknown>, string][],
): JMAPResponse {
  return {
    methodResponses,
    sessionState: "state-123",
  }
}

export function createErrorResponse(
  clientId: string,
  errorType: string,
  description?: string,
): JMAPResponse {
  return {
    methodResponses: [["error", { type: errorType, description }, clientId]],
    sessionState: "state-123",
  }
}

export function getRequestBody(capturedRequests: CapturedRequest[], index = -1) {
  const idx = index < 0 ? capturedRequests.length + index : index
  return capturedRequests[idx]?.body as {
    using: string[]
    methodCalls: [string, Record<string, unknown>, string][]
  } | null
}

export function getMethodCall(
  capturedRequests: CapturedRequest[],
  requestIndex = -1,
  callIndex = 0,
) {
  const body = getRequestBody(capturedRequests, requestIndex)
  return body?.methodCalls[callIndex] ?? null
}
