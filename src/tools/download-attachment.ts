import { basename } from "node:path"

import { getClient } from "./shared.ts"

export interface DownloadAttachmentResult {
  blobId: string
  path: string
  size: number
}

export async function downloadAttachment(
  blobId: string,
  outputPath: string,
): Promise<DownloadAttachmentResult> {
  const token = Bun.env.FASTMAIL_API_TOKEN
  if (!token) {
    throw new Error("FASTMAIL_API_TOKEN environment variable is required")
  }

  const client = getClient()
  const session = await client.getSession()
  const accountId = await client.getAccountId()
  const filename = basename(outputPath)

  const url = session.downloadUrl
    .replace("{accountId}", encodeURIComponent(accountId))
    .replace("{blobId}", encodeURIComponent(blobId))
    .replace("{name}", encodeURIComponent(filename))

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  await Bun.write(outputPath, buffer)

  return { blobId, path: outputPath, size: buffer.byteLength }
}
