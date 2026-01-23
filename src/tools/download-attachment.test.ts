import { basename } from "node:path"

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import { downloadAttachment } from "./download-attachment.ts"
import type { CapturedRequest } from "./test-utils.ts"
import { mockSession, TEST_ACCOUNT_ID } from "./test-utils.ts"

describe("download-attachment", () => {
  let originalFetch: typeof globalThis.fetch
  let originalToken: string | undefined

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalToken = Bun.env.FASTMAIL_API_TOKEN
    Bun.env.FASTMAIL_API_TOKEN = "test-token"
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalToken) {
      Bun.env.FASTMAIL_API_TOKEN = originalToken
    } else {
      delete Bun.env.FASTMAIL_API_TOKEN
    }
  })

  test("downloads blob to output path", async () => {
    const capturedRequests: CapturedRequest[] = []
    const content = "attachment-content"

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
        return new Response(JSON.stringify(mockSession), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (urlString.includes("/jmap/download/")) {
        return new Response(content, { status: 200 })
      }

      return new Response("Not Found", { status: 404 })
    }

    const outputPath = `${Bun.env.TMPDIR ?? "/tmp"}/fm-attachment-${crypto.randomUUID()}.txt`
    globalThis.fetch = mock(mockFetchImpl) as unknown as typeof fetch

    const result = await downloadAttachment("blob-123", outputPath)

    const filename = basename(outputPath)
    const expectedUrl = mockSession.downloadUrl
      .replace("{accountId}", encodeURIComponent(TEST_ACCOUNT_ID))
      .replace("{blobId}", encodeURIComponent("blob-123"))
      .replace("{name}", encodeURIComponent(filename))
    const downloadRequest = capturedRequests.find((request) =>
      request.url.includes("/jmap/download/"),
    )

    expect(downloadRequest?.url).toBe(expectedUrl)
    expect(downloadRequest?.headers.Authorization).toBe("Bearer test-token")

    const saved = await Bun.file(outputPath).text()
    expect(saved).toBe(content)
    expect(result).toEqual({
      blobId: "blob-123",
      path: outputPath,
      size: new TextEncoder().encode(content).byteLength,
    })
  })
})
