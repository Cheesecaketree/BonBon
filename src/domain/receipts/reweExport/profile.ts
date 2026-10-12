import type { ExportFact, ReweExport } from './schema'

export type ProfileGroup = 'preferences' | 'estimates' | 'relationship' | 'account'
export interface ProfileCard { id: string; group: ProfileGroup; fact: ExportFact; context: ExportFact[] }
const cards: { id: string; group: ProfileGroup; fields: string[] }[] = [
  { id: 'priceSensitivity', group: 'preferences', fields: ['PREISBEWUSSTSEIN'] },
  { id: 'pricePreference', group: 'preferences', fields: ['price affinity segment name'] },
  { id: 'organic', group: 'preferences', fields: ['current bio affinity segment name', 'BioSegment'] },
  { id: 'age', group: 'estimates', fields: ['LEBENSPHASE'] },
  { id: 'household', group: 'estimates', fields: ['HAUSHALTSGROESSE'] },
  { id: 'power', group: 'estimates', fields: ['KAUFKRAFT'] },
  { id: 'budget', group: 'estimates', fields: ['FMCG_BUDGET'] },
  { id: 'share', group: 'relationship', fields: ['SHARE_OF_WALLET'] },
  { id: 'loyalty', group: 'relationship', fields: ['LOYALITAETSKLASSE'] },
  { id: 'potential', group: 'relationship', fields: ['POTENTIALKLASSE'] },
  { id: 'frequency', group: 'relationship', fields: ['RFM_SEGMENT'] },
  { id: 'channels', group: 'relationship', fields: ['OMNICHANNEL_SEGMENT'] },
  { id: 'primaryMarket', group: 'relationship', fields: ['STAMMMARKT', 'Market Name long'] },
  { id: 'customerGroup', group: 'relationship', fields: ['KUNDENGRUPPE'] },
  { id: 'created', group: 'account', fields: ['Date_Created1', 'CD_RegistryDt'] },
  { id: 'bonusJoined', group: 'account', fields: ['registrationDate'] },
  { id: 'appWeeks', group: 'account', fields: ['OM_AppvisitWeekCount90d'] },
]

export function exportProfileCards(data: ReweExport): ProfileCard[] {
  return cards.flatMap((card) => {
    const fact = card.fields.map((field) => data.facts.find((fact) => fact.field === field)).find(Boolean)
    if (!fact) return []
    const context = data.facts.filter((candidate) => candidate.origin.file === fact.origin.file
      && candidate.origin.table === fact.origin.table && candidate.origin.column === fact.origin.column
      && ['calender week', 'processed timestamp'].includes(candidate.field))
    return [{ id: card.id, group: card.group, fact, context }]
  })
}

const valueTokens: Record<string, string> = {
  'sehr preisunsensibel': 'veryPriceInsensitive', preisunsensibel: 'priceInsensitive', preissensibel: 'priceSensitive',
  'sehr preissensibel': 'veryPriceSensitive', qualitaetsbewusst: 'qualityConscious', qualitätsbewusst: 'qualityConscious',
  '2 Bewusste Bio-Kaeufer': 'consciousOrganic', '2 Bewusste Bio-Käufer': 'consciousOrganic',
  Single: 'onePerson', Mehrpersonenhaushalt: 'multiplePeople',
  'mittlere Kaufkraft': 'mediumPower', 'hohe Kaufkraft': 'highPower', 'niedrige Kaufkraft': 'lowPower',
  'Sehr hoch': 'veryHigh', Hoch: 'high', Mittel: 'medium', Niedrig: 'low', 'Sehr niedrig': 'veryLow',
  'Keine Zuordnung': 'unassigned', Unbekannt: 'unknown', 'Nur Offline': 'inStoreOnly',
  '07-Nur Offline, no OC Experience, Online Potential': 'inStorePotential',
  'REWE Kaufmann': 'independentMarket', 'Markt_ohne_Abholservice': 'noPickup',
  Ja: 'yes', Nein: 'no', true: 'yes', false: 'no', personal: 'personal',
}

// Literal translations of recognized export values, not an enumeration of REWE's
// possible segments. Unknown values and values in other fields remain unchanged.
const translatedFields: Record<string, string[]> = {
  PREISBEWUSSTSEIN: ['veryPriceInsensitive', 'priceInsensitive', 'priceSensitive', 'veryPriceSensitive', 'qualityConscious'],
  'price affinity segment name': ['qualityConscious'],
  'current bio affinity segment name': ['consciousOrganic'],
  BioSegment: ['consciousOrganic'],
  HAUSHALTSGROESSE: ['onePerson', 'multiplePeople'],
  KAUFKRAFT: ['mediumPower', 'highPower', 'lowPower'],
  LOYALITAETSKLASSE: ['veryHigh', 'high', 'medium', 'low', 'veryLow', 'unassigned', 'unknown'],
  POTENTIALKLASSE: ['veryHigh', 'high', 'medium', 'low', 'veryLow', 'unassigned', 'unknown'],
  OMNICHANNEL_SEGMENT: ['inStoreOnly', 'inStorePotential'],
}
const frequentSmallDescription = 'Die Zuordnung zum RFM-Segment High Frequency Customer erfolgt aufgrund einer hohen Kaufhaeufigkeit bei gleichzeitig eher niedrigen durchschnittlichen Umsatzwerten.'

export function profileValueToken(fact: ExportFact): string | undefined {
  if (fact.field === 'RFM_SEGMENT' && fact.value === frequentSmallDescription) return 'frequentSmall'
  const token = valueTokens[fact.value]
  return token && translatedFields[fact.field]?.includes(token) ? token : undefined
}

export type ProfileValueFormat = 'money' | 'ratio' | 'percent' | 'number' | 'date' | 'boolean' | 'text'
const moneyFields = new Set(['FMCG_BUDGET', 'Average value of receipt', 'app coupon discount', 'ECOM_DBonBto6mo'])
const percentFields = new Set(['ECOM_OrderAppShare', 'NL_OpenRate30d', 'Push_OpenRate30d'])
const dateFields = new Set(['Date_Created1', 'registrationDate', 'CD_RegistryDt', 'processed timestamp', 'AS_LastOrderDt', 'LS_LastOrderDt', 'LP_LastRedemptionDate', 'LP_last_use', 'Last_Appvisit', 'Last_Webvisit', 'first use of app coupon', 'last use of app coupon', 'market info: first sales day'])

export function profileValueFormat(field: string): ProfileValueFormat {
  if (field === 'SHARE_OF_WALLET') return 'ratio'
  if (moneyFields.has(field)) return 'money'
  if (percentFields.has(field)) return 'percent'
  if (dateFields.has(field)) return 'date'
  if (field === 'CD_EbonReception365d') return 'boolean'
  if (field === 'price affinity score' || field === 'CD_DataRichness' || /Count|SumPoints/.test(field)
    || ['average number of distinct article ids', 'purchased products with app coupon', 'amout of distinct app coupons', 'number of online receipts', 'number of used app coupons', 'LS_OrderCountTotal'].includes(field)) return 'number'
  return 'text'
}
