<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EChartsOption } from 'echarts'
import type { DayAggregate, Receipt } from '../../domain/receipts/types'
import { WEEKDAYS_DE, WEEKDAYS_EN, aggregateAccumulatedDays, aggregateDays, basketExtremes, cadenceDistribution, filterReceipts, hourlyAggregates, marketAggregates, monthlySpend, receiptYear, regularityStats, spendingPace, summaryStats, weekdayHourMatrix } from '../../domain/receipts/analytics'
import { enrichmentCoverage, financialSummary, monthlyFinancials, paybackSummary, productAggregates, productAveragePrices, productTotalQuantity, vatAggregates, type ProductAggregate } from '../../domain/receipts/basketAnalytics'
import { getMarketDisplayName, getMarketSource, getMarketShortName, getMarketData } from '../../domain/receipts/markets'
import { getStoredLocalMarketMatches } from '../../domain/receipts/marketContributions'
import ActivityCalendar from './ActivityCalendar.vue'
import ChartCard, { type StickyYConfig } from './ChartCard.vue'
import DetailDrawer, { type DrawerTarget, type FinancialMetric } from './DetailDrawer.vue'

const props = defineProps<{ receipts: Receipt[]; locale: 'de' | 'en' }>()
const emit = defineEmits<{ addReceipts: []; improveMarkets: [] }>()
const { t } = useI18n()
type View = 'overview' | 'money' | 'products' | 'habits'
type Metric = 'spend' | 'trips' | 'median'
type MarketMetric = 'spend' | 'median'
type ProductSort = 'spend' | 'quantity' | 'avgPrice' | 'name'
const years = computed(() => [...new Set(props.receipts.map(receiptYear))].sort((a,b) => b-a))
const markets = computed(() => [...new Set(props.receipts.map(r => r.marketId))].sort())
const selectedYear = ref<number|'all'>(Math.max(...years.value))
const selectedMarkets = ref(new Set(markets.value))
const activeView = ref<View>('overview')
const marketMetric = ref<MarketMetric>('spend'); const hourMetric = ref<Metric>('trips')
const productSort = ref<ProductSort>('spend'); const productSearch = ref(''); const visibleProductCount = ref(50)
const drawerTarget = ref<DrawerTarget>(); const drawerTrigger = ref<HTMLElement>()
const isMobile = ref(false); let mobileQuery: MediaQueryList | undefined
const localMarketMatches = getStoredLocalMarketMatches()
const showAllMarkets = ref(false); const showAllVisits = ref(false)
onMounted(() => { mobileQuery = matchMedia('(max-width: 820px)'); isMobile.value = mobileQuery.matches; mobileQuery.addEventListener('change', mobileChanged) })
onBeforeUnmount(() => { mobileQuery?.removeEventListener('change', mobileChanged); document.body.classList.remove('dialog-open') })
function mobileChanged(e: MediaQueryListEvent) { isMobile.value = e.matches }
function marketTitle(id: string) { const d = getMarketData(id, localMarketMatches); return d?.name || `${t('market')} ${id}` }
function marketAddress(id: string) { const d = getMarketData(id, localMarketMatches); const loc = [d?.street ? `${d.street} ${d.houseNumber || ''}`.trim() : '', d?.city].filter(Boolean).join(', '); return loc ? `${loc} · #${id}` : `#${id}` }
watch(years, v => { if (selectedYear.value !== 'all' && !v.includes(selectedYear.value)) selectedYear.value = Math.max(...v) })
watch(markets, (v,old) => { if (!old?.length || selectedMarkets.value.size === old.length) selectedMarkets.value = new Set(v) })
const filtered = computed(() => filterReceipts(props.receipts, selectedYear.value, selectedMarkets.value))
const isAllYears = computed(() => selectedYear.value === 'all')
const stats = computed(() => summaryStats(filtered.value))
const days = computed(() => isAllYears.value ? aggregateAccumulatedDays(filtered.value, 2024) : aggregateDays(filtered.value))
const weekdays = computed(() => props.locale === 'de' ? WEEKDAYS_DE : WEEKDAYS_EN)
const months = computed(() => Array.from({length:12},(_,i) => new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE':'en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2024,i,1)))))
const currency = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE':'en-GB',{style:'currency',currency:'EUR'}))
const integer = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE':'en-GB'))
const decimal = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE':'en-GB',{maximumFractionDigits:3}))
const percent = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE':'en-GB',{style:'percent',maximumFractionDigits:0}))
const tabs = computed(() => ([{id:'overview' as View,label:t('overviewTab')},{id:'money' as View,label:t('moneyTab')},{id:'products' as View,label:t('productsTab')},{id:'habits' as View,label:t('habitsTab')}]))
function money(c:number) { return currency.value.format(c/100) }
function formatDate(s:string) { const [y,m,d]=s.slice(0,10).split('-').map(Number); return new Intl.DateTimeFormat(props.locale === 'de'?'de-DE':'en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d))) }
function shortDate(s:string) { const [y,m,d]=s.split('-').map(Number); return new Intl.DateTimeFormat(props.locale === 'de'?'de-DE':'en-GB',{day:'2-digit',month:'2-digit',year:isAllYears.value?'2-digit':undefined,timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d))) }
function marketDisplayName(id:string) { return getMarketDisplayName(id,t('market'),localMarketMatches) }
function marketShortName(id:string) { return getMarketShortName(id,t('market'),localMarketMatches) }
function toggleMarket(id:string) { const n=new Set(selectedMarkets.value); n.has(id)?n.delete(id):n.add(id); selectedMarkets.value=n }
function switchTab(view:View,focus=false) { activeView.value=view; nextTick(() => { if(focus) document.getElementById(`dashboard-tab-${view}`)?.focus() }) }
function handleTabKeys(e:KeyboardEvent,i:number) { if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return; e.preventDefault(); const count=tabs.value.length; const n=e.key==='Home'?0:e.key==='End'?count-1:(i+(e.key==='ArrowRight'?1:-1)+count)%count; switchTab(tabs.value[n].id,true) }
function openDrawer(target:DrawerTarget) { drawerTrigger.value=document.activeElement as HTMLElement; drawerTarget.value=target }
function openDay(day:DayAggregate) { openDrawer({kind:'day',day}) }
function openReceipt(receipt:Receipt) { openDrawer({kind:'receipt',receipt}) }
function openProduct(product:ProductAggregate) { openDrawer({kind:'product',product}) }
function hasFinancialMetric(receipt:Receipt,metric:FinancialMetric,vatRatePercent?:number) {
  if (metric==='bonusEarned') return receipt.loyalty?.earnedCents!==undefined
  if (metric==='bonusSpent') return receipt.loyalty?.spentCents!==undefined
  if (metric==='bonusBalance') return receipt.loyalty?.balanceCents!==undefined
  if (metric==='paybackEarned') return receipt.payback?.pointsEarned!==undefined
  if (metric==='paybackPointsBefore') return receipt.payback?.pointsBefore!==undefined
  if (metric==='paybackEquivalent') return receipt.payback?.balanceEquivalentCents!==undefined
  if (metric==='vat') return (receipt.vatBreakdown??[]).some(row=>vatRatePercent===undefined||row.ratePercent===vatRatePercent)
  return (receipt.items??[]).some(item=>metric==='discount'?item.kind==='discount':metric==='depositCharged'?item.kind==='deposit':metric==='depositReturned'?item.kind==='depositReturn':item.kind==='deposit'||item.kind==='depositReturn')
}
function financialReceipts(metric:FinancialMetric,vatRatePercent?:number) { return filtered.value.filter(receipt=>hasFinancialMetric(receipt,metric,vatRatePercent)) }
function openFinancial(metric:FinancialMetric,receipts=financialReceipts(metric),vatRatePercent?:number) { openDrawer({kind:'financial',metric,receipts,...(vatRatePercent===undefined?{}:{vatRatePercent})}) }
function latestFinancialReceipt(metric:FinancialMetric,timestamp:string|undefined) { return timestamp===undefined?[]:filtered.value.filter(receipt=>receipt.localTimestamp===timestamp&&hasFinancialMetric(receipt,metric)).slice(0,1) }
function openFinancialMonth(group:'bonus'|'deposit',payload:unknown) { const point=payload as {dataIndex?:number;seriesName?:string}; const metric:FinancialMetric=group==='bonus'?(point.seriesName===t('bonusRedeemed')?'bonusSpent':'bonusEarned'):point.seriesName===t('depositReturned')?'depositReturned':point.seriesName===t('discounts')?'discount':'depositCharged'; const receipts=financialReceipts(metric).filter(receipt=>point.dataIndex===undefined||Number(receipt.localTimestamp.slice(5,7))-1===point.dataIndex); openFinancial(metric,receipts) }
function openVatRate(payload:unknown) { const point=payload as {dataIndex?:number}; const row=point.dataIndex===undefined?undefined:vatData.value[point.dataIndex]; openFinancial('vat',row?.receipts??financialReceipts('vat'),row?.ratePercent) }
function closeDrawer() { drawerTarget.value=undefined; nextTick(()=>drawerTrigger.value?.focus()) }
watch(drawerTarget,target => { document.body.classList.toggle('dialog-open',Boolean(target)) })

function base(){return {aria:{enabled:true},textStyle:{fontFamily:'Inter,system-ui,sans-serif',color:'#4f4343',fontSize:isMobile.value?10:12},grid:{left:isMobile.value?42:72,right:22,top:28,bottom:58},tooltip:{trigger:'axis' as const,confine:true,backgroundColor:'#241d1d',borderWidth:0,textStyle:{color:'#fffaf1'}}}}
function axisTitle(name:string,gap=34,omitOnMobile=false){if(omitOnMobile&&isMobile.value)return {};return {name,nameLocation:'middle' as const,nameGap:gap,nameTextStyle:{color:'#756767',fontSize:isMobile.value?10:11,fontWeight:700}}}
function metricAxis(metric:Metric){return t(`axes.${metric}`)}
const colors=['#9b2848','#d98470','#6f1732','#c4627a','#4a1523','#e29b82']
const pace = computed(() => spendingPace(props.receipts,selectedMarkets.value))
const paceOption = computed<EChartsOption>(() => { const chosen=selectedYear.value==='all'?years.value[0]:selectedYear.value; return {...base(),legend:{top:0,right:8},grid:{...base().grid,left:isMobile.value?44:72,top:48},xAxis:{type:'value',min:1,max:366,...axisTitle(t('axes.calendarDay'),34),axisLabel:{formatter:(d:number)=>new Intl.DateTimeFormat(props.locale==='de'?'de-DE':'en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2024,0,d)))},splitLine:{show:false}},yAxis:{type:'value',...axisTitle(t('axes.cumulativeSpend'),isMobile.value?48:56,true),axisLabel:{formatter:'{value} €'},splitLine:{lineStyle:{color:'#e8ddd2'}}},tooltip:{...base().tooltip,formatter:(p:any)=>(Array.isArray(p)?p:[p]).map((x:any)=>`${x.marker} ${x.seriesName}: <strong>${money(x.value[1]*100)}</strong>`).join('<br>')},series:pace.value.map((s,i)=>({name:String(s.year),type:'line',showSymbol:false,data:s.points.map(p=>[p.dayOfYear,p.cumulativeCents/100]),lineStyle:{width:s.year===chosen?4:2,opacity:s.year===chosen?1:.45,color:colors[i%colors.length]},itemStyle:{color:colors[i%colors.length]},emphasis:{focus:'series'}}))} })
const monthlyOption = computed<EChartsOption>(() => { const ys=(selectedYear.value==='all'?years.value.slice().reverse():[selectedYear.value]); return {...base(),legend:{show:ys.length>1,top:0,right:8},grid:{...base().grid,left:isMobile.value?38:58,top:ys.length>1?45:28},xAxis:{type:'category',data:months.value,...axisTitle(t('axes.month')),axisTick:{show:false}},yAxis:{type:'value',...axisTitle(t('axes.spend'),isMobile.value?48:56,true),axisLabel:{formatter:'{value} €'},splitLine:{lineStyle:{color:'#e8ddd2'}}},series:ys.map((y,i)=>({name:String(y),type:'bar',data:monthlySpend(filtered.value.filter(r=>receiptYear(r)===y)).map(v=>v/100),itemStyle:{color:colors[i%colors.length],borderRadius:[5,5,0,0]},barMaxWidth:28}))} })
const marketData = computed(() => marketAggregates(filtered.value).sort((a,b)=>(marketMetric.value==='spend'?b.spendCents-a.spendCents:b.medianCents-a.medianCents)||a.marketId.localeCompare(b.marketId)))
const visibleMarketData = computed(() => showAllMarkets.value ? marketData.value : marketData.value.slice(0, 5))
const maxMarketSpend = computed(() => Math.max(1, ...marketData.value.map(x => x.spendCents)))
const maxMarketMedian = computed(() => Math.max(1, ...marketData.value.map(x => x.medianCents)))
const marketOption = computed<EChartsOption>(() => ({...base(),grid:{left:isMobile.value?98:205,right:22,top:16,bottom:58},xAxis:{type:'value',...axisTitle(metricAxis(marketMetric.value)),axisLabel:{formatter:'{value} €',hideOverlap:true},splitNumber:isMobile.value?3:5,splitLine:{lineStyle:{color:'#e8ddd2'}}},yAxis:{type:'category',...axisTitle(t('axes.market'),isMobile.value?106:190,true),inverse:true,data:marketData.value.map(x=>marketShortName(x.marketId)),axisLabel:{width:isMobile.value?90:175,overflow:'truncate'}},tooltip:{trigger:'item',confine:true,formatter:(p:any)=>{const x=marketData.value[p.dataIndex];return `${marketDisplayName(x.marketId)}<br>${t('spend')}: <strong>${money(x.spendCents)}</strong><br>${t('trips')}: <strong>${x.trips}</strong><br>${t('medianBasket')}: <strong>${money(x.medianCents)}</strong>`}},series:[{type:'bar',data:marketData.value.map(x=>marketMetric.value==='spend'?x.spendCents/100:x.medianCents/100),itemStyle:{color:'#9b2848',borderRadius:[0,6,6,0]},barMaxWidth:30}]}))
const marketVisits=computed(()=>marketAggregates(filtered.value).sort((a,b)=>b.trips-a.trips||a.marketId.localeCompare(b.marketId)))
const visibleMarketVisits = computed(() => showAllVisits.value ? marketVisits.value : marketVisits.value.slice(0, 5))
const maxMarketVisits = computed(() => Math.max(1, ...marketVisits.value.map(x => x.trips)))
const marketVisitsOption=computed<EChartsOption>(()=>({...base(),grid:{left:isMobile.value?98:205,right:22,top:16,bottom:58},xAxis:{type:'value',...axisTitle(t('axes.trips')),minInterval:1,axisLabel:{hideOverlap:true},splitNumber:isMobile.value?3:5,splitLine:{lineStyle:{color:'#e8ddd2'}}},yAxis:{type:'category',...axisTitle(t('axes.market'),isMobile.value?106:190,true),inverse:true,data:marketVisits.value.map(value=>marketShortName(value.marketId)),axisLabel:{width:isMobile.value?90:175,overflow:'truncate'}},tooltip:{trigger:'item',confine:true,formatter:(point:any)=>{const value=marketVisits.value[point.dataIndex];return `${marketDisplayName(value.marketId)}<br>${t('trips')}: <strong>${value.trips}</strong>`}},series:[{type:'bar',data:marketVisits.value.map(value=>value.trips),itemStyle:{color:'#6f1732',borderRadius:[0,6,6,0]},barMaxWidth:30}]}))
const hours=computed(()=>hourlyAggregates(filtered.value))
const hourlyFocusRatio = computed(() => {
  const active = hours.value.filter(h => h.trips > 0)
  if (!active.length) return 0.5
  const minHour = active[0].hour
  const maxHour = active[active.length - 1].hour
  const centerHour = (minHour + maxHour) / 2
  return Math.max(0.1, Math.min(0.9, (centerHour + 0.5) / 24))
})

function computeNiceScale(maxVal: number) {
  if (maxVal <= 5) {
    const ticks: number[] = []
    for (let i = maxVal; i >= 0; i--) ticks.push(i)
    return { max: maxVal, interval: 1, ticks }
  }
  const rawInterval = maxVal / 3
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval || 1)))
  const normalized = rawInterval / magnitude
  let step = 1
  if (normalized > 5) step = 10
  else if (normalized > 2) step = 5
  else if (normalized > 1) step = 2
  const interval = Math.max(1, step * magnitude)
  const top = Math.ceil(maxVal / interval) * interval
  const count = Math.round(top / interval)
  const ticks: number[] = []
  for (let i = count; i >= 0; i--) ticks.push(i * interval)
  return { max: top, interval, ticks }
}

const hourlyScale = computed(() => {
  const values = hours.value.map(x => hourMetric.value === 'spend' ? x.spendCents / 100 : hourMetric.value === 'trips' ? x.trips : x.medianCents / 100)
  return computeNiceScale(Math.max(1, ...values))
})

const hourlyStickyY = computed<StickyYConfig | undefined>(() => {
  if (!isMobile.value) return undefined
  const labels = hourlyScale.value.ticks.map(v => hourMetric.value === 'trips' ? String(v) : `${v} €`)
  const maxLen = Math.max(...labels.map(l => l.length))
  return {
    labels,
    top: '28px',
    bottom: '58px',
    width: `${Math.max(34, maxLen * 7 + 10)}px`,
    align: 'space-between'
  }
})

const hourlyOption=computed<EChartsOption>(()=>({...base(),grid:{...base().grid,left:isMobile.value?6:58},xAxis:{type:'category',data:hours.value.map(x=>String(x.hour)),...axisTitle(t('axes.hourOfDay')),axisLabel:{interval:isMobile.value?1:0},axisTick:{show:false}},yAxis:{type:'value',min:isMobile.value?0:undefined,max:isMobile.value?hourlyScale.value.max:undefined,interval:isMobile.value?hourlyScale.value.interval:undefined,...axisTitle(metricAxis(hourMetric.value),isMobile.value?48:56,true),minInterval:hourMetric.value==='trips'?1:undefined,axisLabel:{show:!isMobile.value,formatter:hourMetric.value==='trips'?'{value}':'{value} €'},splitLine:{lineStyle:{color:'#e8ddd2'}}},series:[{type:'bar',data:hours.value.map(x=>hourMetric.value==='spend'?x.spendCents/100:hourMetric.value==='trips'?x.trips:x.medianCents/100),itemStyle:{color:'#6f1732',borderRadius:[5,5,0,0]},barMaxWidth:19}]}))
const cadence=computed(()=>cadenceDistribution(filtered.value))
const cadenceOption=computed<EChartsOption>(()=>({...base(),grid:{...base().grid,left:isMobile.value?30:58,bottom:isMobile.value?76:58},xAxis:{type:'category',data:cadence.value.map(x=>t(`cadence.${x.key}`)),...axisTitle(t('axes.interval'),isMobile.value?52:34),axisLabel:{interval:0,rotate:isMobile.value?35:0},axisTick:{show:false}},yAxis:{type:'value',...axisTitle(t('axes.count'),isMobile.value?42:48,true),minInterval:1,splitLine:{lineStyle:{color:'#e8ddd2'}}},tooltip:{trigger:'item',confine:true,formatter:(p:any)=>`${p.name}<br><strong>${p.value}</strong> · ${percent.value.format(cadence.value[p.dataIndex].share)}`},series:[{type:'bar',data:cadence.value.map(x=>x.count),itemStyle:{color:'#d98470',borderRadius:[6,6,0,0]},barMaxWidth:42}]}))
const regularity=computed(()=>regularityStats(filtered.value))
const regularityScale = computed(() => {
  const maxTrips = Math.max(1, ...regularity.value.weeks.map(w => w.trips))
  return computeNiceScale(maxTrips)
})
const regularityStickyY = computed<StickyYConfig | undefined>(() => {
  if (!isMobile.value || regularity.value.weeks.length <= 20) return undefined
  const labels = regularityScale.value.ticks.map(String)
  return {
    labels,
    top: '28px',
    bottom: '66px',
    width: '24px',
    align: 'space-between'
  }
})
const regularityOption=computed<EChartsOption>(()=>({...base(),grid:{...base().grid,left:(isMobile.value&&regularity.value.weeks.length>20)?6:(isMobile.value?30:58),bottom:66},tooltip:{...base().tooltip,formatter:(p:any)=>`${t('weekStarting',{date:p[0]?.name})}<br><strong>${p[0]?.value??0} ${t('tripsMode').toLowerCase()}</strong>`},xAxis:{type:'category',data:regularity.value.weeks.map(w=>shortDate(w.date)),...axisTitle(t('axes.week'),44),axisLabel:{interval:Math.max(0,Math.floor(regularity.value.weeks.length/(isMobile.value?4:8))-1),rotate:25},axisTick:{show:false}},yAxis:{type:'value',min:(isMobile.value&&regularity.value.weeks.length>20)?0:undefined,max:(isMobile.value&&regularity.value.weeks.length>20)?regularityScale.value.max:undefined,interval:(isMobile.value&&regularity.value.weeks.length>20)?regularityScale.value.interval:undefined,...axisTitle(t('axes.trips'),isMobile.value?42:48,true),minInterval:1,axisLabel:{show:!(isMobile.value&&regularity.value.weeks.length>20)},splitLine:{lineStyle:{color:'#e8ddd2'}}},series:[{type:'line',data:regularity.value.weeks.map(w=>({value:w.trips,itemStyle:{color:w.date===regularity.value.busiestWeek?.date?'#6f1732':'#9b2848'}})),smooth:true,symbolSize:7,lineStyle:{color:'#9b2848',width:3},areaStyle:{color:'rgba(155,40,72,.09)'}}]}))

const heatmapStickyY = computed<StickyYConfig | undefined>(() => {
  if (!isMobile.value) return undefined
  return {
    labels: weekdays.value.slice().reverse(),
    top: '16px',
    bottom: '82px',
    width: '34px',
    align: 'center'
  }
})

const heatmapOption=computed<EChartsOption>(()=>{const data=weekdayHourMatrix(filtered.value).flatMap((row,d)=>row.map((v,h)=>[h,d,v]));return {...base(),grid:{left:isMobile.value?6:70,right:8,top:16,bottom:82},tooltip:{trigger:'item',confine:true},xAxis:{type:'category',data:hours.value.map(x=>String(x.hour)),...axisTitle(t('axes.hourOfDay'),32),axisLabel:{interval:isMobile.value?1:0},splitArea:{show:true},axisLine:{show:false},axisTick:{show:false}},yAxis:{type:'category',data:weekdays.value,...axisTitle(t('axes.weekday'),isMobile.value?45:52,true),axisLabel:{show:!isMobile.value},splitArea:{show:true},axisLine:{show:false},axisTick:{show:false}},visualMap:{min:0,max:Math.max(1,...data.map(d=>Number(d[2]))),orient:'horizontal',left:'center',bottom:0,inRange:{color:['#f5ede3','#e7b6aa','#9b2848','#541125']}},series:[{type:'heatmap',data,itemStyle:{borderColor:'#fffaf1',borderWidth:2,borderRadius:3}}]}})
const extremes=computed(()=>basketExtremes(filtered.value))
const routine=computed(()=>{const m=weekdayHourMatrix(filtered.value);let best={day:0,start:0,count:0};for(let d=0;d<7;d++)for(let h=0;h<24;h+=2){const count=m[d][h]+m[d][h+1];if(count>best.count)best={day:d,start:h,count}}return best})
const paceInsight=computed(()=>{const y=selectedYear.value==='all'?years.value[0]:selectedYear.value;const cur=pace.value.find(s=>s.year===y),prev=pace.value.find(s=>s.year===y-1);if(!cur?.points.length||!prev?.points.length)return null;const last=cur.points.at(-1)!,comp=[...prev.points].reverse().find(p=>p.dayOfYear<=last.dayOfYear);return comp?{delta:last.cumulativeCents-comp.cumulativeCents,year:y-1}:null})
const coverage=computed(()=>enrichmentCoverage(filtered.value))
const finances=computed(()=>financialSummary(filtered.value))
const financialMonths=computed(()=>monthlyFinancials(filtered.value))
const vatData=computed(()=>vatAggregates(filtered.value))
const payback=computed(()=>paybackSummary(filtered.value))
const products=computed(()=>productAggregates(filtered.value))
const filteredProducts=computed(()=>{const query=productSearch.value.trim().toLocaleLowerCase(props.locale==='de'?'de-DE':'en-GB');return query?products.value.filter(product=>product.name.toLocaleLowerCase(props.locale==='de'?'de-DE':'en-GB').includes(query)):products.value})
const matchedProductCount=computed(()=>filteredProducts.value.length)
const visibleProducts=computed(()=>[...filteredProducts.value].sort((a,b)=>{if(productSort.value==='name') return a.name.localeCompare(b.name,props.locale==='de'?'de-DE':'en-GB');if(productSort.value==='quantity'){const qtyA=productTotalQuantity(a);const qtyB=productTotalQuantity(b);return qtyB-qtyA||b.spendCents-a.spendCents||a.name.localeCompare(b.name)}if(productSort.value==='avgPrice'){const avgA=productAveragePrices(a)[0]?.averagePriceCents??0;const avgB=productAveragePrices(b)[0]?.averagePriceCents??0;return avgB-avgA||b.spendCents-a.spendCents||a.name.localeCompare(b.name)}return b.spendCents-a.spendCents||productTotalQuantity(b)-productTotalQuantity(a)||a.name.localeCompare(b.name)}).slice(0,visibleProductCount.value))
watch([productSearch,productSort],()=>{visibleProductCount.value=50})
function quantitySummary(product:ProductAggregate){return Object.entries(product.quantities).map(([unit,value])=>`${decimal.value.format(value)} ${t(`quantityUnits.${unit}`)}`).join(' · ')}
function averagePriceSummary(product:ProductAggregate){const avgs=productAveragePrices(product);if(!avgs.length)return '–';return avgs.map(a=>`${money(a.averagePriceCents)} / ${t(`quantityUnits.${a.unit}`)}`).join(' · ')}
const bonusOption=computed<EChartsOption>(()=>({...base(),legend:{top:0,right:8},grid:{...base().grid,left:isMobile.value?38:58,top:48},xAxis:{type:'category',data:months.value,...axisTitle(t('axes.month')),axisTick:{show:false}},yAxis:{type:'value',...axisTitle(t('axes.value'),isMobile.value?48:56,true),axisLabel:{formatter:'{value} €'},splitLine:{lineStyle:{color:'#e8ddd2'}}},series:[{name:t('bonusEarned'),type:'bar',data:financialMonths.value.map(value=>value.bonusEarnedCents/100),itemStyle:{color:'#9b2848',borderRadius:[4,4,0,0]}},{name:t('bonusRedeemed'),type:'bar',data:financialMonths.value.map(value=>value.bonusSpentCents/100),itemStyle:{color:'#d98470',borderRadius:[4,4,0,0]}}]}))
const depositOption=computed<EChartsOption>(()=>({...base(),legend:{top:0,right:8},grid:{...base().grid,left:isMobile.value?38:58,top:48},xAxis:{type:'category',data:months.value,...axisTitle(t('axes.month')),axisTick:{show:false}},yAxis:{type:'value',...axisTitle(t('axes.value'),isMobile.value?48:56,true),axisLabel:{formatter:'{value} €'},splitLine:{lineStyle:{color:'#e8ddd2'}}},series:[{name:t('depositCharged'),type:'bar',data:financialMonths.value.map(value=>value.depositChargedCents/100),itemStyle:{color:'#6f1732',borderRadius:[4,4,0,0]}},{name:t('depositReturned'),type:'bar',data:financialMonths.value.map(value=>value.depositReturnedCents/100),itemStyle:{color:'#e29b82',borderRadius:[4,4,0,0]}},{name:t('discounts'),type:'line',data:financialMonths.value.map(value=>value.discountCents/100),lineStyle:{color:'#9b2848',width:3},itemStyle:{color:'#9b2848'}}]}))
const vatOption=computed<EChartsOption>(()=>({...base(),grid:{left:isMobile.value?42:95,right:22,top:18,bottom:58},xAxis:{type:'category',data:vatData.value.map(value=>`${value.ratePercent} %`),...axisTitle(t('axes.vatRate')),axisTick:{show:false}},yAxis:{type:'value',...axisTitle(t('axes.value'),isMobile.value?48:56,true),axisLabel:{formatter:'{value} €'},splitLine:{lineStyle:{color:'#e8ddd2'}}},tooltip:{trigger:'item',confine:true,formatter:(point:any)=>{const value=vatData.value[point.dataIndex];return `${value.ratePercent} %<br>${t('netAmount')}: <strong>${money(value.netCents)}</strong><br>${t('vatPaid')}: <strong>${money(value.taxCents)}</strong><br>${t('grossAmount')}: <strong>${money(value.grossCents)}</strong>`}},series:[{type:'bar',data:vatData.value.map(value=>value.taxCents/100),itemStyle:{color:'#9b2848',borderRadius:[5,5,0,0]},barMaxWidth:64}]}))
</script>

<template>
<section class="dashboard">
  <header class="dashboard-heading"><div><h1>{{ isAllYears?t('dashboardAllYears'):t('dashboard') }}</h1><p>{{ isAllYears?t('dashboardAllYearsIntro'):t('dashboardIntro') }}</p></div><div class="filter-bar"><button type="button" class="filter-add-btn" @click="emit('addReceipts')">+ {{ t('importMore') }}</button><label class="filter-field"><span class="filter-label">{{ t('year') }}</span><select v-model="selectedYear"><option value="all">{{ t('allYears') }}</option><option v-for="year in years" :key="year" :value="year">{{ year }}</option></select></label><div class="filter-field"><span class="filter-label">{{ t('markets') }}</span><details class="market-filter"><summary><span>{{ t('selected') }}</span><strong>{{ selectedMarkets.size }}/{{ markets.length }}</strong></summary><div class="market-menu"><button type="button" class="market-select-all" @click="selectedMarkets=new Set(markets)">{{ t('allMarkets') }}</button><div class="market-items-list"><div v-for="market in markets" :key="market" class="market-item-row"><label class="market-item-label"><input type="checkbox" :checked="selectedMarkets.has(market)" @change="toggleMarket(market)"><span class="market-item-name">{{ marketDisplayName(market) }}</span></label><button v-if="getMarketSource(market,localMarketMatches)==='local'" class="local-match-indicator" type="button" :title="t('localMatchInfo')" :aria-label="t('localMatchOpen',{id:market})" @click="emit('improveMarkets')">ⓘ {{ t('localMatchBadge') }} ↗</button></div></div></div></details></div></div></header>
  <nav class="analytics-tabs" role="tablist" :aria-label="t('analyticsViews')"><button v-for="(tab,index) in tabs" :id="`dashboard-tab-${tab.id}`" :key="tab.id" type="button" role="tab" :aria-selected="activeView===tab.id" :aria-controls="`dashboard-panel-${tab.id}`" :tabindex="activeView===tab.id?0:-1" @click="switchTab(tab.id)" @keydown="handleTabKeys($event,index)">{{ tab.label }}</button></nav>
  <p v-if="!filtered.length" class="empty-filtered">{{ t('emptyFiltered') }}</p>
  <section v-else-if="activeView==='overview'" id="dashboard-panel-overview" role="tabpanel" aria-labelledby="dashboard-tab-overview">
    <section class="stat-grid primary-stats" :aria-label="t('overviewTab')"><article><span>{{ t('totalSpend') }}</span><strong>{{ money(stats.totalCents) }}</strong></article><article><span>{{ t('trips') }}</span><strong>{{ integer.format(stats.trips) }}</strong></article><article><span>{{ t('averageBasket') }}</span><strong>{{ money(stats.averageCents) }}</strong></article><article><span>{{ t('medianBasket') }}</span><strong>{{ money(stats.medianCents) }}</strong></article><article><span>{{ t('marketsVisited') }}</span><strong>{{ stats.marketCount }}</strong></article></section>
    <section class="insight-strip" :aria-label="t('highlights')"><button v-if="finances.bonusEarnedCents" type="button" @click="openFinancial('bonusEarned')"><span>{{ t('bonusEarned') }}</span><strong>{{ money(finances.bonusEarnedCents) }}</strong><small>{{ t('bonusValueCopy') }}</small></button><button v-else-if="paceInsight" type="button" @click="switchTab('money')"><span>{{ t('spendingPace') }}</span><strong>{{ paceInsight.delta>=0?'+':'' }}{{ money(paceInsight.delta) }}</strong><small>{{ t(paceInsight.delta>=0?'paceAhead':'paceBehind',{year:paceInsight.year}) }}</small></button><button v-if="products[0]" type="button" @click="openProduct(products[0])"><span>{{ t('topProduct') }}</span><strong>{{ products[0].name }}</strong><small>{{ money(products[0].spendCents) }} · {{ t('productOccurrenceCount',{count:products[0].occurrences}) }}</small></button><button v-else type="button" @click="switchTab('habits')"><span>{{ t('shoppingRhythm') }}</span><strong>{{ weekdays[routine.day] }} · {{ String(routine.start).padStart(2,'0') }}–{{ String(routine.start+2).padStart(2,'0') }}</strong><small>{{ t('mostCommonWindow') }}</small></button><button v-if="extremes.largest" type="button" @click="openReceipt(extremes.largest)"><span>{{ t('notableBasket') }}</span><strong>{{ money(extremes.largest.totalCents) }}</strong><small>{{ t('largestBasketOn',{date:formatDate(extremes.largest.localTimestamp.slice(0,10))}) }}</small></button></section>
    <article class="calendar-card"><header class="card-heading"><div><h2>{{ t('calendar') }}</h2><p>{{ isAllYears?t('calendarAllYearsCopy'):t('calendarCopy') }}</p></div></header><ActivityCalendar :year="isAllYears?2024:Number(selectedYear)" :days="days" :is-accumulated="isAllYears" :locale="locale" :local-market-matches="localMarketMatches" @select="openDay" /></article>
  </section>
  <section v-else-if="activeView==='money'" id="dashboard-panel-money" role="tabpanel" aria-labelledby="dashboard-tab-money" class="chart-grid">
    <section class="stat-grid money-stats wide" :aria-label="t('moneySummary')"><button type="button" @click="openFinancial('bonusEarned')"><span>{{ t('bonusEarned') }}</span><strong>{{ money(finances.bonusEarnedCents) }}</strong><small>{{ t('bonusRedeemed') }} {{ money(finances.bonusSpentCents) }}</small></button><button type="button" @click="openFinancial('bonusBalance',latestFinancialReceipt('bonusBalance',finances.latestBonusBalance?.timestamp))"><span>{{ t('latestBonusBalance') }}</span><strong>{{ finances.latestBonusBalance?money(finances.latestBonusBalance.cents):'–' }}</strong><small v-if="finances.latestBonusBalance">{{ formatDate(finances.latestBonusBalance.timestamp) }}</small></button><button type="button" @click="openFinancial('depositNet')"><span>{{ t('depositNet') }}</span><strong>{{ money(finances.depositNetCents) }}</strong><small>{{ t('depositReturned') }} {{ money(finances.depositReturnedCents) }}</small></button><button type="button" @click="openFinancial('discount')"><span>{{ t('discounts') }}</span><strong>{{ money(finances.discountCents) }}</strong></button><button type="button" @click="openFinancial('vat')"><span>{{ t('vatPaid') }}</span><strong>{{ money(finances.vatCents) }}</strong></button></section>
    <p v-if="coverage.items<coverage.total" class="coverage-note wide">{{ t('itemCoverage',{covered:coverage.items,total:coverage.total}) }} <button type="button" @click="emit('addReceipts')">{{ t('reimportForDetails') }}</button></p>
    <ChartCard class="wide" dense tall :title="t('spendingPace')" :copy="t('spendingPaceCopy')" :option="paceOption"/>
    <ChartCard :title="t('monthlySpendComparison')" :copy="t('monthlySpendComparisonCopy')" :option="monthlyOption" :scrollable="isMobile && isAllYears" scroll-min-width="560px" :scroll-hint="t('scrollTimelineHint')"/>
    <ChartCard :title="t('marketComparison')" :copy="marketData.length===1?t('singleMarketCopy'):t('marketComparisonCopy')" :option="marketOption">
      <template #actions>
        <div class="metric-toggle">
          <button v-for="metric in (['spend','median'] as MarketMetric[])" :key="metric" type="button" :class="{active:marketMetric===metric}" :aria-pressed="marketMetric===metric" @click="marketMetric=metric">{{ t(`metricNames.${metric}`) }}</button>
        </div>
      </template>
      <div class="market-rank-list" role="list" :aria-label="t('marketComparison')">
        <div v-for="item in visibleMarketData" :key="item.marketId" class="market-rank-item" role="listitem">
          <div class="market-rank-row">
            <div class="market-rank-label">
              <strong class="market-rank-title">{{ marketTitle(item.marketId) }}</strong>
              <span class="market-rank-sub">{{ marketAddress(item.marketId) }}</span>
            </div>
            <div class="market-rank-values">
              <strong class="market-rank-primary">{{ marketMetric==='spend' ? money(item.spendCents) : money(item.medianCents) }}</strong>
              <span class="market-rank-secondary">{{ item.trips }} {{ t('tripsMode').toLowerCase() }}</span>
            </div>
          </div>
          <div class="market-rank-track" aria-hidden="true">
            <div class="market-rank-fill" :style="{ width: `${Math.max(2, (marketMetric==='spend' ? item.spendCents/maxMarketSpend : item.medianCents/maxMarketMedian)*100)}%` }" />
          </div>
        </div>
        <button v-if="marketData.length > 5" class="market-rank-more" type="button" @click="showAllMarkets = !showAllMarkets">
          {{ showAllMarkets ? t('showFewerMarkets') : t('showAllMarkets', { count: marketData.length }) }}
        </button>
      </div>
    </ChartCard>
    <ChartCard v-if="coverage.bonus" :title="t('bonusFlow')" :copy="t('bonusFlowCopy')" :option="bonusOption" @select="openFinancialMonth('bonus',$event)"/>
    <ChartCard v-if="coverage.items" :title="t('depositFlow')" :copy="t('depositFlowCopy')" :option="depositOption" @select="openFinancialMonth('deposit',$event)"/>
    <ChartCard v-if="coverage.vat" class="wide" :title="t('vatBreakdown')" :copy="t('vatBreakdownCopy')" :option="vatOption" @select="openVatRate"/>
    <details v-if="payback.receiptCount" class="legacy-card wide"><summary>{{ t('legacyPayback') }}</summary><p>{{ t('legacyPaybackCopy') }}</p><div class="legacy-stats"><button type="button" @click="openFinancial('paybackEarned')"><span>{{ t('pointsEarned') }}</span><strong>{{ integer.format(payback.pointsEarned) }}</strong></button><button v-if="payback.latestPointsBefore" type="button" @click="openFinancial('paybackPointsBefore',latestFinancialReceipt('paybackPointsBefore',payback.latestPointsBefore.timestamp))"><span>{{ t('latestPoints') }}</span><strong>{{ integer.format(payback.latestPointsBefore.points) }}</strong><small>{{ formatDate(payback.latestPointsBefore.timestamp) }}</small></button><button v-if="payback.latestEquivalent" type="button" @click="openFinancial('paybackEquivalent',latestFinancialReceipt('paybackEquivalent',payback.latestEquivalent.timestamp))"><span>{{ t('latestEquivalent') }}</span><strong>{{ money(payback.latestEquivalent.cents) }}</strong></button></div></details>
  </section>
  <section v-else-if="activeView==='products'" id="dashboard-panel-products" role="tabpanel" aria-labelledby="dashboard-tab-products">
    <p v-if="coverage.items<coverage.total" class="coverage-note">{{ t('itemCoverage',{covered:coverage.items,total:coverage.total}) }} <button type="button" @click="emit('addReceipts')">{{ t('reimportForDetails') }}</button></p>
    <article class="product-card"><header class="product-heading"><div><h2>{{ t('productRanking') }}</h2><p>{{ t('productRankingCopy') }}</p></div><div class="product-controls"><label><span class="sr-only">{{ t('searchProducts') }}</span><input v-model="productSearch" type="search" :placeholder="t('searchProducts')"></label><label><span class="sr-only">{{ t('sortProducts') }}</span><select v-model="productSort"><option value="spend">{{ t('productSortSpend') }}</option><option value="quantity">{{ t('productSortQuantity') }}</option><option value="avgPrice">{{ t('productSortAvgPrice') }}</option><option value="name">{{ t('productSortName') }}</option></select></label></div></header><div class="product-table-wrap"><table class="product-table"><thead><tr><th>{{ t('product') }}</th><th>{{ t('quantity') }}</th><th>{{ t('avgPrice') }}</th><th>{{ t('spend') }}</th></tr></thead><tbody><tr v-for="product in visibleProducts" :key="product.name"><td><button type="button" @click="openProduct(product)">{{ product.name }} <span aria-hidden="true">›</span></button></td><td>{{ quantitySummary(product) }}</td><td>{{ averagePriceSummary(product) }}</td><td>{{ money(product.spendCents) }}</td></tr></tbody></table><p v-if="!visibleProducts.length" class="empty-products">{{ t('noProductsFound') }}</p></div><button v-if="visibleProducts.length<matchedProductCount" class="load-more" type="button" @click="visibleProductCount+=50">{{ t('showMoreProducts') }}</button></article>
  </section>
  <section v-else id="dashboard-panel-habits" role="tabpanel" aria-labelledby="dashboard-tab-habits" class="chart-grid"><article class="chart-card wide rhythm-card"><header><div><h3>{{ t('calendarRegularity') }}</h3><p>{{ t('calendarRegularityCopy') }}</p></div></header><div class="rhythm-stats"><div><span>{{ t('longestGap') }}</span><strong>{{ regularity.longestGapHours===null?'–':t('daysValue',{value:(regularity.longestGapHours/24).toFixed(1)}) }}</strong></div><div><span>{{ t('activeWeekStreak') }}</span><strong>{{ regularity.activeWeekStreak }}</strong></div><div><span>{{ t('repeatVisitDays') }}</span><strong>{{ regularity.repeatVisitDays }}</strong></div><div><span>{{ t('busiestWeek') }}</span><strong>{{ regularity.busiestWeek?`${shortDate(regularity.busiestWeek.date)} · ${regularity.busiestWeek.trips}`:'–' }}</strong></div></div><ChartCard class="embedded-chart" dense :title="t('weeklyRhythm')" :option="regularityOption" :scrollable="isMobile && regularity.weeks.length > 20" :scroll-min-width="Math.max(500, regularity.weeks.length * 14) + 'px'" :scroll-hint="t('scrollTimelineHint')" :scroll-focus-ratio="1" :sticky-y="regularityStickyY"/></article><ChartCard :title="t('tripCadence')" :copy="t('tripCadenceCopy')" :option="cadenceOption"/><ChartCard :title="t('timeOfDayProfile')" :copy="t('timeOfDayProfileCopy')" :option="hourlyOption" :scrollable="isMobile" scroll-min-width="580px" :scroll-hint="t('scrollTimelineHint')" :scroll-focus-ratio="hourlyFocusRatio" :sticky-y="hourlyStickyY"><template #actions><div class="metric-toggle"><button v-for="metric in (['trips','spend','median'] as Metric[])" :key="metric" type="button" :class="{active:hourMetric===metric}" :aria-pressed="hourMetric===metric" @click="hourMetric=metric">{{ t(`metricNames.${metric}`) }}</button></div></template></ChartCard><ChartCard class="wide" :title="t('marketVisits')" :copy="t('marketVisitsCopy')" :option="marketVisitsOption"><div class="market-rank-list" role="list" :aria-label="t('marketVisits')"><div v-for="item in visibleMarketVisits" :key="item.marketId" class="market-rank-item" role="listitem"><div class="market-rank-row"><div class="market-rank-label"><strong class="market-rank-title">{{ marketTitle(item.marketId) }}</strong><span class="market-rank-sub">{{ marketAddress(item.marketId) }}</span></div><div class="market-rank-values"><strong class="market-rank-primary">{{ item.trips }} {{ t('tripsMode').toLowerCase() }}</strong><span class="market-rank-secondary">{{ money(item.spendCents) }}</span></div></div><div class="market-rank-track" aria-hidden="true"><div class="market-rank-fill" :style="{ width: `${Math.max(2, (item.trips/maxMarketVisits)*100)}%` }" /></div></div><button v-if="marketVisits.length > 5" class="market-rank-more" type="button" @click="showAllVisits = !showAllVisits">{{ showAllVisits ? t('showFewerMarkets') : t('showAllMarkets', { count: marketVisits.length }) }}</button></div></ChartCard><ChartCard class="wide" dense tall :title="t('weekdayTime')" :copy="t('weekdayTimeCopy')" :option="heatmapOption" :scrollable="isMobile" scroll-min-width="600px" :scroll-hint="t('scrollTimelineHint')" :scroll-focus-ratio="hourlyFocusRatio" :sticky-y="heatmapStickyY"/></section>
  <DetailDrawer v-if="drawerTarget" :target="drawerTarget" :locale="locale" :all-years="isAllYears" :local-market-matches="localMarketMatches" @close="closeDrawer"/>
</section>
</template>
