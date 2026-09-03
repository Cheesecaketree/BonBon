import {
  marketObservationSubmissionSchema,
  type MarketObservationSubmission,
} from '../domain/receipts/marketObservationSchema'

export type MarketContributionReceipt = {
  submissionId: string
  marketCount: number
}

export async function submitMarketObservations(
  endpoint: string,
  submission: MarketObservationSubmission,
): Promise<MarketContributionReceipt> {
  const payload = marketObservationSubmissionSchema.parse(submission)
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message || `Submission failed with status ${response.status}.`)
  }

  return response.json() as Promise<MarketContributionReceipt>
}

