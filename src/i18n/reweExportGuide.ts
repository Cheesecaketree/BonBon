/**
 * Content for the "request your REWE data" guide.
 *
 * Kept outside the vue-i18n message tree so the copy can use REWE's UI labels verbatim without
 * escaping message syntax. Wrap a label shown on rewe.de in [[double brackets]]; the guide renders
 * it in bold. Labels stay German in both locales because REWE's site is German.
 */

export interface GuideStep {
  title: string
  text: string
  note?: string
}

export interface GuideContent {
  eyebrow: string
  title: string
  lead: string
  checked: string
  openPrivacy: string
  steps: GuideStep[]
  importButton: string
  confusionTitle: string
  confusionCopy: string
  privacyCopy: string
  outdated: string
  reportIssue: string
  back: string
}

/** Month the steps were last walked through on rewe.de. Update when re-checking the guide. */
export const guideCheckedOn = '2026-11'

/** REWE account page „Daten und Sicherheit“, where the export is requested and later downloaded. */
export const rewePrivacyPage = 'https://www.rewe.de/shop/mydata/privacy'

const de: GuideContent = {
  eyebrow: 'Anleitung',
  title: 'So bekommst du deinen REWE-Datenexport',
  lead: 'REWE stellt dir die gespeicherten Daten deines Kontos als Datei bereit. Du forderst sie in deinem REWE Konto an, bekommst eine E-Mail, sobald sie fertig ist, und lädst sie auf derselben Seite herunter. Meist dauert das nur ein paar Stunden.',
  checked: 'Zuletzt geprüft: {date}',
  openPrivacy: '„Daten und Sicherheit“ bei REWE öffnen',
  steps: [
    {
      title: 'Anmelden und Seite öffnen',
      text: 'Melde dich bei rewe.de an und öffne über den Link oben die Seite [[Daten und Sicherheit]] in deinem REWE Konto.',
      note: 'Ohne Link: Klicke auf rewe.de oben rechts auf deinen Vornamen und wähle [[Daten und Sicherheit]].',
    },
    {
      title: 'Datenübertragung anfragen',
      text: 'Scrolle zum Abschnitt [[Übertragen deiner Daten]] und klicke auf [[Datenübertragung anfragen]].',
      note: 'Danach steht dort [[Datenübertragung angefragt]]. Du kannst die Seite jetzt schließen.',
    },
    {
      title: 'Auf die E-Mail warten',
      text: 'REWE stellt die Datei zusammen. Das dauert meist nur ein paar Stunden. Sobald sie fertig ist, bekommst du eine E-Mail.',
    },
    {
      title: 'Datei herunterladen',
      text: 'Öffne [[Daten und Sicherheit]] noch einmal. Im Abschnitt [[Übertragen deiner Daten]] kannst du die Datei jetzt herunterladen, statt sie anzufragen.',
    },
    {
      title: 'In BonBon öffnen',
      text: 'Entpacke den Download, falls er gezippt ist. Wähle dann den entpackten Ordner aus oder zieh ihn ins Importfeld.',
    },
  ],
  importButton: 'Zum Import',
  confusionTitle: 'Nicht verwechseln:',
  confusionCopy: 'Auf derselben Seite gibt es auch [[Auskunft über deine Daten]]. Das ist eine allgemeine Anfrage über das Kontaktformular und liefert nicht die Datei, die BonBon lesen kann.',
  privacyCopy: 'Anmeldung, Anfrage und Download passieren direkt bei REWE. Die Datei wertest du danach nur in deinem Browser aus. BonBon ist kein Angebot von REWE.',
  outdated: 'REWE kann Seiten und Beschriftungen jederzeit ändern. Stimmt etwas nicht mehr?',
  reportIssue: 'Auf GitHub melden',
  back: 'Zurück zum Import',
}

const en: GuideContent = {
  eyebrow: 'Guide',
  title: 'How to get your REWE data export',
  lead: 'REWE provides the data stored in your account as a file. You request it in your REWE account, get an email once it is ready, and download it from the same page. It usually takes only a few hours.',
  checked: 'Last checked: {date}',
  openPrivacy: 'Open “Daten und Sicherheit” at REWE',
  steps: [
    {
      title: 'Sign in and open the page',
      text: 'Sign in on rewe.de and use the link above to open [[Daten und Sicherheit]] (data and security) in your REWE account.',
      note: 'Without the link: on rewe.de, click your first name in the top-right corner and choose [[Daten und Sicherheit]].',
    },
    {
      title: 'Request the data transfer',
      text: 'Scroll to [[Übertragen deiner Daten]] (transfer your data) and click [[Datenübertragung anfragen]] (request data transfer).',
      note: 'The section then reads [[Datenübertragung angefragt]] (requested). You can close the page now.',
    },
    {
      title: 'Wait for the email',
      text: 'REWE puts the file together. This usually takes only a few hours. You get an email once it is ready.',
    },
    {
      title: 'Download the file',
      text: 'Open [[Daten und Sicherheit]] again. In the [[Übertragen deiner Daten]] section, you can now download the file instead of requesting it.',
    },
    {
      title: 'Open it in BonBon',
      text: 'Unzip the download if it is zipped. Then select the unzipped folder or drag it onto the import area.',
    },
  ],
  importButton: 'Go to import',
  confusionTitle: 'Don’t mix them up:',
  confusionCopy: 'The same page also has [[Auskunft über deine Daten]] (information about your data). That is a general request through the contact form and does not produce the file BonBon can read.',
  privacyCopy: 'Signing in, requesting and downloading all happen directly at REWE. You then analyse the file only in your browser. BonBon is not a REWE service.',
  outdated: 'REWE can change its pages and labels at any time. Something no longer matches?',
  reportIssue: 'Report it on GitHub',
  back: 'Back to import',
}

export const reweExportGuide: Record<'de' | 'en', GuideContent> = { de, en }

export type GuideSegment = { label: boolean; text: string }

/** Splits copy into plain text and [[UI label]] segments. Unmatched brackets stay plain text. */
export function guideSegments(text: string): GuideSegment[] {
  const segments: GuideSegment[] = []
  const pattern = /\[\[(.+?)\]\]/g
  let index = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > index) segments.push({ label: false, text: text.slice(index, start) })
    segments.push({ label: true, text: match[1] })
    index = start + match[0].length
  }
  if (index < text.length) segments.push({ label: false, text: text.slice(index) })
  return segments
}
