import React, { useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marketContributionFileSchema } from '../src/domain/receipts/marketSchema.js'
import { formatMarketFullName } from '../src/domain/receipts/markets.js'
import { loadDataset, writeDatasetAtomically } from './market_data_tools.mjs'
import {
  applyReviewedMappings,
  buildReviewQueue,
  draftFromObservation,
  mappingFromDraft,
  type MappingDraft,
  type PendingEntry,
  type ReviewDecision,
  type ReviewGroup,
} from './market_review_model.js'

const fieldDefinitions: Array<{ key: keyof MappingDraft; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'street', label: 'Street' },
  { key: 'houseNumber', label: 'House no.' },
  { key: 'zip', label: 'ZIP' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
]

function FieldGrid({ draft }: { draft: MappingDraft }) {
  return <Box flexDirection="column" marginTop={1}>
    {fieldDefinitions.map((field) => <Box key={field.key}>
      <Box width={12}><Text dimColor>{field.label}</Text></Box>
      <Text>{draft[field.key] || '—'}</Text>
    </Box>)}
  </Box>
}

function Editor({ initial, onSave, onCancel }: { initial: MappingDraft; onSave: (draft: MappingDraft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [active, setActive] = useState(0)
  useInput((input, key) => {
    if (key.escape) return onCancel()
    if (key.tab || key.downArrow) return setActive((value) => (value + 1) % fieldDefinitions.length)
    if (key.upArrow) return setActive((value) => (value - 1 + fieldDefinitions.length) % fieldDefinitions.length)
    if (key.ctrl && input === 's') onSave(draft)
  })

  return <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
    <Text bold color="cyan">Edit all fields</Text>
    {fieldDefinitions.map((field, index) => <Box key={field.key}>
      <Box width={12}><Text color={active === index ? 'cyan' : undefined}>{active === index ? '› ' : '  '}{field.label}</Text></Box>
      {active === index
        ? <TextInput value={draft[field.key]} onChange={(value) => setDraft({ ...draft, [field.key]: value })} onSubmit={() => setActive((index + 1) % fieldDefinitions.length)} />
        : <Text>{draft[field.key] || '—'}</Text>}
    </Box>)}
    <Box marginTop={1}><Text><Text color="green">Ctrl+S Save</Text>  <Text color="yellow">Esc Cancel</Text>  <Text dimColor>Tab/↑/↓ Move</Text></Text></Box>
  </Box>
}

type ReviewAppProps = {
  groups: ReviewGroup[]
  automaticDecisions: ReviewDecision[]
  onFinish: (decisions: ReviewDecision[] | null) => void
}

function ReviewApp({ groups, automaticDecisions, onFinish }: ReviewAppProps) {
  const { exit } = useApp()
  const [index, setIndex] = useState(0)
  const [editing, setEditing] = useState(false)
  const [summary, setSummary] = useState(groups.length === 0)
  const [error, setError] = useState('')
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({})
  const [drafts, setDrafts] = useState<Record<string, MappingDraft>>(() => Object.fromEntries(groups.map((group) => [group.marketId, group.candidate])))
  const [selectedVariants, setSelectedVariants] = useState<Record<string, number>>({})
  const group = groups[index]

  function finish(result: ReviewDecision[] | null) {
    onFinish(result)
    exit()
  }

  function move(offset: number) {
    setError('')
    setIndex((value) => (value + offset + groups.length) % groups.length)
  }

  function advance() {
    setError('')
    if (index === groups.length - 1) setSummary(true)
    else setIndex(index + 1)
  }

  function decide(status: 'accepted' | 'rejected') {
    if (!group) return
    if (status === 'rejected') {
      setDecisions({ ...decisions, [group.marketId]: { entryIds: group.entries.map((entry) => entry.entryId), status } })
      return advance()
    }
    try {
      const mapping = mappingFromDraft(group.marketId, drafts[group.marketId], group.bundled)
      setDecisions({ ...decisions, [group.marketId]: { entryIds: group.entries.map((entry) => entry.entryId), status, mapping } })
      advance()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'The candidate is incomplete.'
      setError(`Incomplete candidate: ${message}`)
      setEditing(true)
    }
  }

  function defer() {
    if (!group) return
    const next = { ...decisions }
    delete next[group.marketId]
    setDecisions(next)
    advance()
  }

  function useObservation(variantIndex: number) {
    if (!group?.variants[variantIndex]) return
    setDrafts({
      ...drafts,
      [group.marketId]: draftFromObservation(group.variants[variantIndex], drafts[group.marketId]),
    })
    setSelectedVariants({ ...selectedVariants, [group.marketId]: variantIndex })
    setError('')
  }

  useInput((input, key) => {
    if (editing) return
    const action = input.toLowerCase()
    if (summary) {
      if (action === 'c') finish([...automaticDecisions, ...Object.values(decisions)])
      if (action === 'b' && groups.length) setSummary(false)
      if (action === 'q' || key.escape) finish(null)
      return
    }
    if (/^[1-9]$/.test(input)) useObservation(Number(input) - 1)
    else if (action === 'a') decide('accepted')
    else if (action === 'e') { setError(''); setEditing(true) }
    else if (action === 'r') decide('rejected')
    else if (action === 'd') defer()
    else if (action === 'q' || key.escape) finish(null)
    else if (key.leftArrow) move(-1)
    else if (key.rightArrow) move(1)
  })

  if (summary) {
    const manual = Object.values(decisions)
    const accepted = [...automaticDecisions, ...manual].filter((decision) => decision.status === 'accepted').length
    const rejected = manual.filter((decision) => decision.status === 'rejected').length
    const deferred = groups.length - manual.length
    return <Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={2} paddingY={1}>
      <Text bold color="magenta">BonBon market review · ready to commit</Text>
      <Box marginTop={1} flexDirection="column">
        <Text><Text color="green">{accepted} accepted groups</Text> ({automaticDecisions.length} safe confirmations automated)</Text>
        <Text color="red">{rejected} rejected groups</Text>
        <Text color="yellow">{deferred} deferred groups</Text>
      </Box>
      <Box marginTop={1}><Text><Text bold color="green">[C] Commit</Text>  <Text color="cyan">[B] Back</Text>  <Text color="yellow">[Q] Quit without changes</Text></Text></Box>
    </Box>
  }

  const currentDecision = decisions[group.marketId]
  const confidenceColor = group.confidence === 'complete' ? 'green' : group.confidence === 'conflict' ? 'red' : 'yellow'
  return <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1}>
    <Box justifyContent="space-between">
      <Text bold color="magenta">BonBon market review</Text>
      <Text>{index + 1}/{groups.length} · {automaticDecisions.length} auto</Text>
    </Box>
    <Box marginTop={1} gap={2}>
      <Text bold>Market {group.marketId}</Text>
      <Text>{group.entries.length} submission(s)</Text>
      <Text color={confidenceColor}>{group.confidence.toUpperCase()}</Text>
      {currentDecision && <Text color={currentDecision.status === 'accepted' ? 'green' : 'red'}>{currentDecision.status.toUpperCase()}</Text>}
    </Box>

    {group.bundled && <Box flexDirection="column" marginTop={1}><Text bold color="blue">Current bundled mapping</Text><Text>{formatMarketFullName(group.bundled)}</Text></Box>}
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Submitted text ({group.variants.length} distinct)</Text>
      {group.variants.slice(0, 9).map((variant, variantIndex) => <Text key={variantIndex} wrap="wrap" color={selectedVariants[group.marketId] === variantIndex ? 'cyan' : undefined}>{selectedVariants[group.marketId] === variantIndex ? '›' : ' '} {variantIndex + 1}. {variant.replace(/\n/g, ' · ')}</Text>)}
      {group.variants.length > 9 && <Text dimColor>  … {group.variants.length - 9} more</Text>}
    </Box>

    {editing
      ? <Editor initial={drafts[group.marketId]} onCancel={() => setEditing(false)} onSave={(draft) => {
          setDrafts({ ...drafts, [group.marketId]: draft })
          setEditing(false)
          setError('')
          if (decisions[group.marketId]?.status === 'accepted') {
            try {
              const mapping = mappingFromDraft(group.marketId, draft, group.bundled)
              setDecisions({
                ...decisions,
                [group.marketId]: {
                  ...decisions[group.marketId],
                  mapping,
                },
              })
            } catch {
              const next = { ...decisions }
              delete next[group.marketId]
              setDecisions(next)
            }
          }
        }} />
      : <Box flexDirection="column" marginTop={1}><Text bold>Proposed mapping</Text><FieldGrid draft={drafts[group.marketId]} /></Box>}
    {!!group.conflictingFields.length && <Text color="red">Conflicting suggestions: {group.conflictingFields.join(', ')}</Text>}
    {error && <Text color="red">{error}</Text>}
    {!editing && <Box marginTop={1}><Text><Text bold color="cyan">[1-9] Autofill</Text>  <Text bold color="green">[A] Approve</Text>  <Text color="cyan">[E] Edit</Text>  <Text color="red">[R] Reject</Text>  <Text color="yellow">[D] Defer</Text>  <Text dimColor>[←/→] Navigate  [Q] Quit</Text></Text></Box>}
  </Box>
}

const endpoint = (process.env.MARKET_CONTRIBUTION_API_URL || '').replace(/\/$/, '')
const token = process.env.MARKET_CONTRIBUTION_ADMIN_TOKEN || ''
if (!endpoint || !token) throw new Error('MARKET_CONTRIBUTION_API_URL and MARKET_CONTRIBUTION_ADMIN_TOKEN are required.')
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('The market review requires an interactive terminal.')

const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
const response = await fetch(`${endpoint}/v1/admin/submissions`, { headers })
if (!response.ok) throw new Error(`Could not fetch pending observations (${response.status}).`)
const body = await response.json() as { entries: PendingEntry[] }
if (!body.entries.length) {
  console.log('No pending market observations.')
  process.exit(0)
}

const dataset = await loadDataset()
const queue = buildReviewQueue(body.entries, dataset)
const selected = await new Promise<ReviewDecision[] | null>((resolveSelection) => {
  render(<ReviewApp {...queue} onFinish={resolveSelection} />)
})
if (!selected) {
  console.log('Review cancelled; no dataset or API records were changed.')
  process.exit(0)
}

const acceptedMappings = selected.flatMap((decision) => decision.status === 'accepted' && decision.mapping ? [decision.mapping] : [])
const applied = applyReviewedMappings(dataset, acceptedMappings)
if (applied.additions || applied.updates) {
  const inbox = resolve('.market-contributions')
  await mkdir(inbox, { recursive: true })
  const reviewPath = resolve(inbox, `reviewed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  const contribution = marketContributionFileSchema.parse({ schemaVersion: 2, markets: acceptedMappings })
  await writeFile(reviewPath, `${JSON.stringify(contribution, null, 2)}\n`, 'utf8')
  await writeDatasetAtomically(applied.dataset)
  console.log(`Dataset updated: ${applied.additions} added, ${applied.updates} changed. Review file: ${reviewPath}`)
}

for (const decision of selected) {
  for (const entryId of decision.entryIds) {
    const decisionResponse = await fetch(`${endpoint}/v1/admin/entries/${entryId}/decision`, {
      method: 'POST', headers,
      body: JSON.stringify({ status: decision.status, ...(decision.mapping ? { mapping: decision.mapping } : {}) }),
    })
    if (!decisionResponse.ok) throw new Error(`Could not record decision for entry ${entryId} (${decisionResponse.status}).`)
  }
}
console.log(`Review complete: ${selected.length} groups committed; ${applied.corroborations} dataset mappings corroborated.`)
