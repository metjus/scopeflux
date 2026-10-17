'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Search,ArrowUpRight,Bookmark,RefreshCw,SlidersHorizontal,Globe2,ArrowRight,X,Download,Check,Clock3,Info,Plus,Trash2,ChevronDown,History} from 'lucide-react';
import {TLDS} from '../lib/domains';
import {CATALOG_TLDS} from '../lib/catalog';
import type {FeedInfo} from '../lib/catalog';
import type {DomainRecord} from '../lib/domains';
import {STATUS_INFO,statusInfo} from '../lib/status';
import StatusGuide from './status-guide';
import SiteNavigation from './site-navigation';
import DomainLookup from './domain-lookup';
import DomainDetails from './domain-details';
import {pageFromLocation,pageLabel,pagePath} from '../lib/navigation';
import type {PageId} from '../lib/navigation';
import {AboutPage,SourcesPage,PrivacyPage,ContactPage} from './info-pages';
import {orderListings} from '../lib/list-order';
import {assessPremium} from '../lib/premium';
import {calendarDaysFromToday,usualReleaseHint} from '../lib/release-time';
import {defaultPeriod,expectedRelease,filterListings,paginateListings,nextSourcePage} from '../lib/catalog-view';
import ResultPagination from './result-pagination';
import CatalogueCoverage from './catalogue-coverage';
import {catalogueCsv} from '../lib/catalog-export';
import {historicalDate} from '../lib/public-history';
import AdSlot from './ad-slot';
import {apiRequest} from '../lib/api-client';
import {refreshCatalogue} from '../lib/catalog-loader';
import type {Catalogue} from '../lib/catalog-loader';
import {mergeDomainDetails} from '../lib/domain-details';
const day=calendarDaysFromToday;
const expectedDate=expectedRelease;
type ApiData={records:DomainRecord[];record:DomainRecord;feeds:FeedInfo[]};
const api=(url:string,options?:RequestInit)=>apiRequest<ApiData>(url,options);
const json=(body:unknown,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export default function Radar({signedIn,initialPage='discover'}:{signedIn:boolean;initialPage?:PageId}){
 const [tab,setTab]=useState<PageId>(initialPage),[rows,setRows]=useState<DomainRecord[]>([]),[saved,setSaved]=useState<DomainRecord[]>([]),[historyRows,setHistoryRows]=useState<DomainRecord[]>([]),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[query,setQuery]=useState(''),[tlds,setTlds]=useState<string[]>([]),[period,setPeriod]=useState('7'),[status,setStatus]=useState('all'),[premium,setPremium]=useState('all'),[length,setLength]=useState('63'),[noHyphen,setNoHyphen]=useState(false),[noNumber,setNoNumber]=useState(false),[sort,setSort]=useState('mixed'),[detail,setDetail]=useState<DomainRecord|null>(null),[busy,setBusy]=useState(''),[toast,setToast]=useState(''),[mobileFilters,setMobileFilters]=useState(false),[lookupQuery,setLookupQuery]=useState(''),[feeds,setFeeds]=useState<FeedInfo[]>([]),[historyFeeds,setHistoryFeeds]=useState<FeedInfo[]>([]),[moreLoading,setMoreLoading]=useState(false),[clock,setClock]=useState(0);
 const [catalogRefreshing,setCatalogRefreshing]=useState(false),[watchRefreshing,setWatchRefreshing]=useState(false),[watchLoading,setWatchLoading]=useState(signedIn),[watchError,setWatchError]=useState(''),[checkingDomain,setCheckingDomain]=useState(false);
 const catalogRequest=useRef(false),detailRequest=useRef(0);
 const feedPages=useRef<Record<string,number>>({}),extensionMenu=useRef<HTMLDetailsElement>(null);
 const [pageState,setPageState]=useState({key:'',page:1});
 const [sourceRetryAt,setSourceRetryAt]=useState<Record<string,number>>({});
 const [sourcePageError,setSourcePageError]=useState('');
 const tableScroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer)},[]);
 const dialog=useRef<HTMLDialogElement>(null),refreshing=useRef(false);
 const notify=(message:string)=>setToast(message);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),7000);return()=>clearTimeout(t)}},[toast]);
 async function loadCatalog(){
   if(catalogRequest.current)return;
   catalogRequest.current=true;setCatalogRefreshing(true);setLoadError('');setSourcePageError('');
   function apply(data:Catalogue){setRows(data.records);setFeeds(data.feeds);feedPages.current=Object.fromEntries(data.feeds.map(feed=>[feed.tld,1]));}
   try{
     const current=await refreshCatalogue(cached=>{apply(cached);setLoading(false);});
     apply(current);
     if(!current.records.length)setLoadError('The sources did not return any upcoming releases. Try refreshing shortly.');
   }catch(error){setLoadError((error as Error).message)}
   finally{catalogRequest.current=false;setLoading(false);setCatalogRefreshing(false);}
 }

 const nextSource=nextSourcePage(feeds,tlds,feedPages.current,sourceRetryAt,clock||Date.now());
 async function loadMore(){
   if(moreLoading||catalogRequest.current||!nextSource)return;
   const source=nextSource;
   setMoreLoading(true);setSourcePageError('');
   try{
     const page=(feedPages.current[source.tld]||1)+1;
     const data=await api('/api/domains?tlds='+source.tld+'&page='+page);
     const failed=data.feeds.find(feed=>feed.error);
     if(failed){
       const retry=Date.now()+(failed.retryAfter||60)*1000;
       const affected=failed.retryAfter?feeds.filter(feed=>feed.source===source.source):[source];
       setSourceRetryAt(current=>({...current,...Object.fromEntries(affected.map(feed=>[feed.tld,retry]))}));
       throw new Error(failed.error);
     }
     setRows(current=>Array.from(new Map([...current,...data.records].map(record=>[record.domain,record])).values()));
     setFeeds(current=>current.map(feed=>data.feeds.find(update=>update.tld===feed.tld)||feed));
     feedPages.current[source.tld]=page;
   }catch(error){setSourcePageError('.'+source.tld+': '+(error as Error).message+' Existing listings were preserved.');}
   finally{setMoreLoading(false);}
 }

 async function loadHistory(){setHistoryLoading(true);setHistoryError('');try{const d=await api('/api/domains?view=recent');setHistoryRows(d.records);setHistoryFeeds(d.feeds)}catch(e){setHistoryError((e as Error).message)}finally{setHistoryLoading(false)}}
 function sinceRelease(r:DomainRecord){const n=day(historicalDate(r));return n===null?'Date unavailable':n===0?'Earlier today':Math.abs(n)+' day'+(Math.abs(n)===1?'':'s')+' ago'}
 function timeLeft(r:DomainRecord){
   const release=expectedDate(r);
   if(!release)return 'Estimate unavailable';
   const now=clock||Date.now();
   if(release.length===10){
     const n=day(release,now)!;
     if(usualReleaseHint(r))return n<0?'Estimate passed · recheck':n===0?'Free ~02:00 tomorrow':'~'+(n+1)+' day'+(n+1===1?'':'s');
     return n<0?'Estimate passed · recheck':n===0?'Today · time not published':'~'+n+' day'+(n===1?'':'s');
   }
   const minutes=Math.ceil((new Date(release).getTime()-now)/60000);
   if(minutes<=0)return 'Recheck availability';
   if(minutes<60)return '~'+minutes+' min';
   const hours=Math.floor(minutes/60);
   return hours>=24?'~'+Math.floor(hours/24)+'d '+hours%24+'h':'~'+hours+'h '+minutes%60+'m';
 }
 function releaseDate(r:DomainRecord){
   const release=tab==='recent'?historicalDate(r):expectedDate(r);
   if(!release)return 'Not confirmed';
   const target=new Date(release.length===10?release+'T12:00:00':release);
   return release.length===10?target.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):target.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 }

 async function refreshList(list:DomainRecord[]){
   if(refreshing.current||!signedIn||!list.length)return;
   refreshing.current=true;setWatchRefreshing(true);
   let changed=0,failed=0,index=0;const out=[...list];
   try{
     await Promise.all(Array.from({length:Math.min(3,list.length)},async()=>{
       while(index<list.length){const i=index++;try{
         const data=await api('/api/watchlist',json({domain:list[i].domain,refresh:true}));out[i]=data.record;if(data.record.changed)changed++;
       }catch{failed++}}
     }));
     setSaved(current=>current.map(record=>out.find(updated=>updated.domain===record.domain)??record));
     if(changed||failed)notify(`${changed} changes in your watchlist${failed?` · ${failed} checks failed; previous records were preserved`:''}.`);
   }finally{refreshing.current=false;setWatchRefreshing(false);}
 }
 async function loadWatchlist(){
   if(!signedIn)return;
   setWatchLoading(true);setWatchError('');
   try{const data=await api('/api/watchlist');setSaved(data.records);void refreshList(data.records);}
   catch(error){setWatchError((error as Error).message)}
   finally{setWatchLoading(false);}
 }
 useEffect(()=>{void loadCatalog();if(signedIn)void loadWatchlist();},[]);
 useEffect(()=>{if(detail){dialog.current?.showModal();}else{dialog.current?.close()}},[detail]);
 const watch=tab==='watch',recent=tab==='recent',informational=tab==='sources'||tab==='about'||tab==='lookup'||tab==='privacy'||tab==='contact',sourceRows=watch?saved:recent?historyRows:rows,viewLoading=watch?watchLoading:recent?historyLoading:loading,viewError=watch?watchError:recent?historyError:loadError;
 useEffect(()=>{if(recent||tab==='sources')void loadHistory()},[recent,tab]);
 useEffect(() => {
   function syncLocation() {
     const next = pageFromLocation(window.location.pathname, window.location.hash);
     setTab(next);
     setStatus('all');
     setSort(next === 'recent' ? 'recent' : 'mixed');
     reset(next);
     setMobileFilters(false);
   }
   syncLocation();
   window.addEventListener('hashchange', syncLocation);
   window.addEventListener('popstate', syncLocation);
   return () => {
     window.removeEventListener('hashchange', syncLocation);
     window.removeEventListener('popstate', syncLocation);
   };
 }, []);
 const previousPage = useRef(tab);
 useEffect(() => {
   if (previousPage.current !== tab) {
     previousPage.current = tab;
     window.scrollTo({top: 0, behavior: 'instant'});
     document.getElementById('page-heading')?.focus({preventScroll: true});
   }
 }, [tab]);
 function navigate(next: PageId) {
   if (next !== tab) {
     reset(next);
     setSort(next === 'recent' ? 'recent' : 'mixed');
   }
   setMobileFilters(false);
   if (extensionMenu.current) extensionMenu.current.open = false;
   setTab(next);
   const target = pagePath(next);
   if (window.location.pathname + window.location.hash !== target) window.history.pushState(null, '', target);
 }
 const pageTitle = pageLabel(tab);
 const filterTlds = watch ? Array.from(new Set([...TLDS, ...saved.map(record => record.tld)])).sort() : CATALOG_TLDS;
 const premiumByDomain=useMemo(()=>new Map(sourceRows.map(r=>[r.domain,assessPremium(r.domain)])),[sourceRows]);
 const detailPremium=detail?assessPremium(detail.domain):null;
 const activeView=watch?'watch':recent?'recent':'discover';
 const filters={tlds,query,period,status,premium,maxLength:Number(length),noHyphen,noNumber};
 const filtered=useMemo(()=>filterListings(sourceRows,filters,activeView,clock||Date.now(),premiumByDomain),[sourceRows,tlds,query,period,status,premium,length,noHyphen,noNumber,activeView,clock,premiumByDomain]);
 const shown=useMemo(()=>orderListings(filtered,sort),[filtered,sort]);
 const paginationKey=JSON.stringify([tab,tlds,query,period,status,premium,length,noHyphen,noNumber,sort]);
 const resultPage=paginateListings(shown,pageState.key===paginationKey?pageState.page:1);
 function changeResultPage(page:number){setPageState({key:paginationKey,page});tableScroll.current?.scrollTo({top:0,behavior:'instant'});}
 function chooseExtension(t?:string){setTlds(t?[t]:[]);if(extensionMenu.current){extensionMenu.current.open=false;extensionMenu.current.querySelector('summary')?.focus();}}
 function toggle(t:string){setTlds(old=>old.includes(t)?old.filter(x=>x!==t):[...old,t]);}
 function reset(view:string=tab){setTlds([]);setQuery('');setPeriod(defaultPeriod(view));setStatus('all');setPremium('all');setLength('63');setNoHyphen(false);setNoNumber(false)}
 function closeDetail(){detailRequest.current++;setCheckingDomain(false);setDetail(null);}
 async function inspectDomain(name:string){
   const request=++detailRequest.current;setCheckingDomain(true);
   try{const data=await api('/api/domains?domain='+encodeURIComponent(name));if(request===detailRequest.current)setDetail(data.record);}
   finally{if(request===detailRequest.current)setCheckingDomain(false);}
 }
 async function check(name=lookupQuery){try{await inspectDomain(name)}catch(error){notify((error as Error).message)}}
 async function openDetail(record:DomainRecord){
   const request=++detailRequest.current;setDetail(record);setCheckingDomain(true);
   try{
     const data=await api('/api/domains?domain='+encodeURIComponent(record.domain));
     if(request===detailRequest.current)setDetail(mergeDomainDetails(data.record,record));
   }catch(error){if(request===detailRequest.current)notify((error as Error).message)}
   finally{if(request===detailRequest.current)setCheckingDomain(false);}
 }

 async function save(name:string){if(!signedIn){notify('Sign in to save domains.');return}setBusy(name);try{const d=await api('/api/watchlist',json({domain:name}));setSaved(old=>[...old.filter(x=>x.domain!==name),d.record]);notify(`${name} is in your watchlist.`)}catch(e){notify((e as Error).message)}finally{setBusy('')}}
 async function remove(name:string){setBusy(name);try{await api('/api/watchlist',json({domain:name},'DELETE'));setSaved(old=>old.filter(x=>x.domain!==name));notify('The domain was removed from your watchlist.')}catch(e){notify((e as Error).message)}finally{setBusy('')}}
 function exportCsv(){
   const url=URL.createObjectURL(new Blob([catalogueCsv(shown)],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download='scopeflux-domains.csv';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 return <div className="app"><a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus();}}>Skip to content</a><SiteNavigation currentPage={tab} watchCount={saved.length} onNavigate={navigate}/>
 <div className="workspace"><header className="topbar"><span className="breadcrumb">Workspace <span>/</span> <strong>{pageTitle}</strong></span><span className="top-right"><span className="beta">BETA</span>{signedIn?<span className="avatar" title="Signed-in account">M</span>:<a className="signin" href="/account/login" target="_top">Sign in <ArrowUpRight size={14}/></a>}</span></header>
 <main id="main-content" tabIndex={-1}><div className="hero"><div><div className="eyebrow"><span className="green-dot"/> DOMAINS ON THE HORIZON</div><h1 id="page-heading" tabIndex={-1}>{tab==='privacy'?<>Your data.<br/><em>Kept to a minimum.</em></>:tab==='contact'?<>Say hello.<br/><em>Questions welcome.</em></>:tab==='lookup'?<>Check any domain.<br/><em>Know where it stands.</em></>:recent?<>Recently expired.<br/><em>The story continues.</em></>:tab==='about'?<>A good name.<br/><em>A new beginning.</em></>:watch?<>Your names.<br/><em>On your radar.</em></>:tab==='sources'?<>Data you<br/><em>can understand.</em></>:<>Expiring soon.<br/><em>Your next opportunity.</em></>}</h1><p>{tab==='privacy'?'What ScopeFlux stores, who processes it and how to ask for it to be deleted.':tab==='contact'?'Write to hello@scopeflux.io.':tab==='lookup'?'Look up registration details and expiration dates for a specific domain, independently of the catalogue’s extensions.':recent?'Browse source-reported deletions and past release estimates. Filter by extension, then open a name to check its current status.':tab==='about'?'Meet the project that helps you discover, understand and follow domain names.':watch?'Your own list of domains, their current status and changes after each check.':tab==='sources'?'Every date has a source. See what is verified and what remains an estimate.':'Browse domains approaching release, see when they may become available and filter by your favourite extensions.'}</p></div><div className="ai-card"><span className="ai-pill">SUPPORTED TLD</span><div className="ai-main"><strong>.sk</strong><span className="orbit"><Globe2 size={53}/><i/></span></div><p>Room for your next project.</p><button onClick={()=>{navigate('discover');setTlds(['sk']);setQuery('')}}>Browse .sk releases <ArrowUpRight size={19}/></button></div></div>
 {!informational&&<><form className="searchbar catalogue-search" onSubmit={e=>e.preventDefault()}><Search size={22}/><input id="catalog-search" aria-label={recent?"Search historical domain listings":"Search upcoming domain listings"} value={query} onChange={e=>setQuery(e.target.value)} placeholder={recent?"Search recent domains by name or keyword…":"Search upcoming domains by name or keyword…"}/><span className="search-caption">{recent?'Filter the archive':'Filter the live catalogue'}</span></form>
 <details className="specific-lookup"><summary><Search size={14}/> Have a specific domain in mind?</summary><form className="lookup-form" onSubmit={e=>{e.preventDefault();void check()}}><label htmlFor="lookup">Full domain name</label><input id="lookup" value={lookupQuery} onChange={e=>setLookupQuery(e.target.value)} placeholder="example.ai" required/><button className="primary" type="submit" disabled={!!busy||checkingDomain}>{checkingDomain?<RefreshCw className="spin" size={15}/>:<Search size={15}/>} Check domain</button></form></details></>}
 {tab==='lookup'?<DomainLookup onCheck={inspectDomain}/>:tab==='privacy'?<PrivacyPage/>:tab==='contact'?<ContactPage/>:tab==='about'?<AboutPage navigate={navigate}/>:tab==='sources'?<SourcesPage feeds={[...feeds,...historyFeeds]}/>:<>
 {!watch&&<AdSlot placement="top"/>}
 <div className="summary-row"><div><span className="metric-icon"><Globe2 size={19}/></span><div><strong>{viewLoading?'—':sourceRows.length.toLocaleString('en-GB')}</strong><span>{watch?'Watchlisted domains':recent?'Observed recent listings':'Domains in the live list'}</span></div></div><div className="extension-metric"><details ref={extensionMenu}><summary className="metric-button" aria-label="View domain extensions and choose a filter"><span className="metric-icon"><SlidersHorizontal size={19}/></span><div><strong>{filterTlds.length} <small>extensions</small></strong><span>Choose an extension <ChevronDown size={11}/></span></div></summary><div className="extension-picker"><strong>Domain extensions</strong><p>TLD means the ending of a domain name, such as .com or .ai.</p><button type="button" className={!tlds.length?'selected':''} onClick={()=>chooseExtension()}><Globe2 size={14}/> All extensions <span>{sourceRows.length.toLocaleString('en-GB')}</span></button>{filterTlds.map(t=><button type="button" className={tlds.includes(t)?'selected':''} key={t} onClick={()=>chooseExtension(t)}><b>.{t}</b><span>{sourceRows.filter(r=>r.tld===t).length.toLocaleString('en-GB')} loaded</span></button>)}</div></details></div><div><span className="metric-icon"><Clock3 size={19}/></span><div><strong>{watch?'On each visit':recent?'30-day archive':'Expected release'}</strong><span>{watch?'Changes are flagged after a check':recent?'Source dates, retained over time':'Date, time and a live countdown'}</span></div></div></div>
 <div className="mobile-filter-toolbar"><span>Refine your search</span><button type="button" className={mobileFilters?'filter-toggle expanded':'filter-toggle'} aria-expanded={mobileFilters} aria-controls="domain-filters" onClick={()=>setMobileFilters(open=>!open)}>{mobileFilters?<X size={17}/>:<SlidersHorizontal size={17}/>} {mobileFilters?'Hide filters':'Show filters'}</button></div><div className="results-layout"><aside id="domain-filters" className={'filters '+(mobileFilters?'mobile-open':'')}><div className="filter-title"><h2><SlidersHorizontal size={17}/> Filters</h2><button onClick={()=>reset()}>Clear</button></div><div className="filter-group"><label>Domain extension <span title="Top-level domain: the ending of a domain name">TLD</span></label><div className="tld-grid">{filterTlds.map(t=><button key={t} aria-pressed={tlds.includes(t)} className={(tlds.includes(t)?'selected ':'')+(t==='ai'?'ai-filter':'')} onClick={()=>toggle(t)}>.{t}{t==='ai'&&<span>✦</span>}</button>)}</div><p>Select one or more extensions.</p></div><div className="filter-group"><label htmlFor="premium">Premium potential</label><select id="premium" aria-describedby="premium-help" value={premium} onChange={e=>setPremium(e.target.value)}><option value="all">All domains</option><option value="premium">Premium candidates</option><option value="other">Other names</option></select><p id="premium-help">Estimated name quality. Registry premium prices are not available in these feeds.</p><details className="premium-rules"><summary>How we select names <ChevronDown size={12}/></summary><ul><li>Short names: 2–4 letters.</li><li>Single words from a curated English / Slovak keyword list.</li><li>Two words from that list, up to 12 letters total; each word at least 3 letters.</li><li>Letters only; no digits or hyphens.</li></ul><p>Rules apply equally to every extension. No price, trademark or resale-value check is included. A name outside these rules may still be valuable.</p></details></div><div className="filter-group"><label htmlFor="period">Date range</label><select id="period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">{recent?'All archived dates':'All dates'}</option>{!recent&&<option value="0">Today</option>}<option value="7">{recent?'Past 7 days':'Within 7 days'}</option><option value="30">{recent?'Past 30 days':'Within 30 days'}</option></select></div>{watch&&<div className="filter-group"><label htmlFor="status">Domain status</label><select id="status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{STATUS_INFO.map(s=><option key={s.label} value={s.label}>{s.label}</option>)}</select><p className="selected-status-help" aria-live="polite">{status==='all'?'Choose a status to see what it means.':statusInfo(status).description}</p><StatusGuide/></div>}<div className="filter-group"><label htmlFor="length">Name length <span>max. {length}</span></label><input id="length" type="range" min="2" max="63" value={length} onChange={e=>setLength(e.target.value)}/><label className="checkbox"><input type="checkbox" checked={noHyphen} onChange={e=>setNoHyphen(e.target.checked)}/> No hyphens</label><label className="checkbox"><input type="checkbox" checked={noNumber} onChange={e=>setNoNumber(e.target.checked)}/> No numbers</label></div><div className="filter-hint"><Info size={16}/><p>Finding a name does not guarantee registration. Confirm current availability with a registrar.</p></div></aside>
 <section className="results"><div className="results-head"><div><h2>{watch?'Watchlisted domains':recent?'Recently expired domains':'Expiring & dropping soon'}</h2><p>{shown.length.toLocaleString('en-GB')} results <span>· {period==='all'?(recent?'All archived dates':'All dates'):recent?'Past '+period+' days':period==='0'?'Today':'Within '+period+' days'}</span> {tlds.length>0?<span>· {tlds.map(t=>'.'+t).join(', ')}</span>:<span>· All extensions{sort==='mixed'?' · Mixed view':''}</span>}{premium!=='all'&&<span> · {premium==='premium'?'Premium potential':'Other names'}</span>}</p></div><div className="table-actions"><button className="icon-button" disabled={!!busy||viewLoading||(!watch&&!recent&&(moreLoading||catalogRefreshing))||(watch&&watchRefreshing)} aria-label="Refresh data" onClick={()=>watch?(watchError?loadWatchlist():refreshList(saved)):recent?loadHistory():loadCatalog()}><RefreshCw size={18} className={(watch&&watchRefreshing)||(!watch&&!recent&&catalogRefreshing)||viewLoading?'spin':''}/></button><button className="icon-button" disabled={!shown.length} aria-label="Export CSV" onClick={exportCsv}><Download size={18}/></button><select aria-label="Sort results" value={sort} onChange={e=>setSort(e.target.value)}><option value="mixed">Mixed extensions</option>{recent?<option value="recent">Most recent first</option>:<option value="date">Soonest first</option>}<option value="name">By name</option></select></div></div>
 {recent&&<div className="archive-note"><History size={17}/><p><strong>Historical observations, not confirmed availability.</strong> Source-reported deletions and past release estimates are labelled separately. The archive covers up to 30 days and grows as public listings are observed.</p></div>}
 {!watch&&!viewLoading&&<CatalogueCoverage records={sourceRows} feeds={recent?historyFeeds:feeds} tlds={tlds} recent={recent} period={period}/>}
 {!watch&&!recent&&catalogRefreshing&&sourceRows.length>0&&<p className="preview-note" role="status"><RefreshCw size={13} className="spin"/> Showing saved listings while sources refresh.</p>}
 {watch&&watchRefreshing&&<p className="preview-note" role="status">Checking saved domains. You can keep browsing and remove names during the check.</p>}
 {viewError&&sourceRows.length>0&&<p className="feed-notice" role="status">Refresh failed: {viewError} Previous listings are still shown.</p>}
 {watch&&!signedIn?<div className="empty"><Bookmark size={34}/><h3>Your list is waiting for its first name.</h3><p>Sign in to save selected domains to your account.</p><a className="primary" href="/account/login" target="_top">Sign in</a></div>:viewLoading&&!sourceRows.length?<div className="empty"><RefreshCw className="spin" size={30}/><h3>Loading the current list…</h3><p>{recent?'Reading saved historical observations.':'Fetching data from a live external source.'}</p></div>:viewError&&!sourceRows.length?<div className="empty"><Info size={32}/><h3>The domain list could not be loaded.</h3><p>{viewError}</p><button className="primary" onClick={()=>watch?loadWatchlist():recent?loadHistory():loadCatalog()}>Try again</button><a href="https://www.backorder.sk/zadrzane" target="_blank" rel="noreferrer">Open source <ArrowUpRight size={14}/></a></div>:watch&&!saved.length?<div className="empty"><Bookmark size={34}/><h3>Your watchlist is ready.</h3><p>Check any domain and choose Add to watchlist, or save a name from the catalogue.</p><button className="primary" onClick={()=>navigate('lookup')}>Check a domain <Search size={16}/></button><button onClick={()=>navigate('discover')}>Explore upcoming releases</button></div>:shown.length===0?<div className="empty"><Globe2 size={34}/><h3>{watch?'No saved domains match your filters.':recent?'No archived listings match your filters.':'No upcoming listings match your filters.'}</h3><p>{watch?'Clear filters to see all saved names.':recent?'There may be no saved observations for this extension or date range yet. The coverage above shows which historical dates are available. Clear other filters to check.':!watch&&tlds.some(t=>t!=='sk')?'No loaded listings match these extensions and filters. Broaden the date range or load more listings below.':'Broaden your date range or clear the name filter to see more upcoming releases.'}</p><button className="primary" onClick={()=>reset()}>Reset filters <SlidersHorizontal size={16}/></button><button onClick={()=>reset()}>Clear filters</button></div>:<div className="table-scroll" ref={tableScroll}><table role="table"><thead role="rowgroup"><tr role="row"><th>DOMAIN</th>{watch&&<th>STATUS</th>}<th>{recent?'HISTORICAL DATE':'EXPECTED AVAILABILITY'} <span title="A projected release, not the registration expiry. Times are local; date-only sources do not publish an hour.">ⓘ</span></th><th>{recent?'WHEN':'TIME LEFT'}</th><th aria-label="Actions"/></tr></thead><tbody role="rowgroup">{resultPage.records.map(r=><tr role="row" key={r.domain}><td role="cell"><button className="domain-name" onClick={()=>openDetail(r)}>{r.domain.slice(0,-r.tld.length-1)}<span>.{r.tld}</span><ArrowUpRight size={14}/></button><small>{r.source}{premiumByDomain.get(r.domain)?.candidate&&<span className="premium-badge" title={premiumByDomain.get(r.domain)!.reason}>Premium potential</span>}{r.changed&&<b className="changed"> · Changed</b>}</small></td>{watch&&<td role="cell" className="domain-status"><button type="button" className={'status '+(r.status==='Recovery period'?'amber':'')} title={statusInfo(r.status).description} aria-label={r.status+': '+statusInfo(r.status).description+' Open domain details.'} onClick={()=>openDetail(r)}><i/>{r.status}<Info size={11}/></button></td>}<td role="cell" data-label={recent?'Historical date':'Expected availability'}><strong className="date">{releaseDate(r)}</strong><small>{recent&&r.reportedDrop?'Source-reported deletion · local time':!r.drop&&r.conditionalRelease?'If not renewed · lifecycle estimate':r.drop?(usualReleaseHint(r)?'Deletion day · '+usualReleaseHint(r):r.drop.length===10?'Day estimate · hour not published':'Source estimate · local time'):'Release not confirmed'}</small></td><td role="cell" data-label={recent?'When':'Time left'}><span className="countdown">{recent?sinceRelease(r):timeLeft(r)}</span></td><td role="cell" className="domain-actions"><button className={'icon-button save '+(saved.some(x=>x.domain===r.domain)?'is-saved':'')} disabled={!!busy} aria-label={watch?'Remove '+r.domain:'Watch '+r.domain} onClick={()=>watch?remove(r.domain):save(r.domain)}>{watch?<Trash2 size={17}/>:saved.some(x=>x.domain===r.domain)?<Check size={18}/>:<Bookmark size={18}/>}</button></td></tr>)}</tbody></table></div>}
 {shown.length>0&&!viewLoading&&<ResultPagination {...resultPage} onPage={changeResultPage}/>}

 {!watch&&!recent&&feeds.some(f=>f.more&&(!tlds.length||tlds.includes(f.tld)))&&<div className="load-more"><button className="primary" disabled={moreLoading||loading||catalogRefreshing||!nextSource} onClick={loadMore}>{moreLoading?<RefreshCw size={15} className="spin"/>:<Plus size={15}/>} {moreLoading?'Loading listings…':nextSource?'Load more .'+nextSource.tld+' listings':'Sources temporarily paused'}</button></div>}
 {!watch&&!recent&&sourcePageError&&<p className="feed-notice" role="status">{sourcePageError}</p>}
 {!watch&&!recent&&tlds.some(t=>feeds.some(f=>f.tld===t&&f.limited))&&<p className="preview-note">{tlds.filter(t=>feeds.some(f=>f.tld===t&&f.limited)).map(t=>'.'+t).join(', ')}: showing the public source preview. Additional provider listings require authorised feed access.</p>}
 {!watch&&!recent&&feeds.some(f=>f.stored)&&<p className="preview-note">Last successful source update: {new Date(Math.min(...feeds.filter(f=>f.stored).map(f=>new Date(f.checkedAt).getTime()))).toLocaleString('en-GB')}. Saved listings remain available if a source cannot be reached.</p>}
 <div className="coverage"><span className="green-dot"/><span>{watch?'Checks on opening the page and on request.':recent?'Deletion reports and past estimates · current availability is not confirmed.':'Release estimates from source lists · not guaranteed availability.'}</span><button onClick={()=>navigate('sources')}>Data coverage <ArrowRight size={14}/></button></div></section></div></>}
 {!informational&&!watch&&<AdSlot placement="bottom"/>}
 <footer><span>ScopeFlux <span className="foot-dot">/</span> Good names are worth watching.</span><span className="foot-links">{(['privacy','contact','sources'] as const).map(id=><a key={id} href={pagePath(id)} onClick={e=>{e.preventDefault();navigate(id)}}>{id==='sources'?<>How to read the data <ArrowUpRight size={14}/></>:id==='privacy'?'Privacy':'Contact'}</a>)}</span></footer></main></div>
 <dialog ref={dialog} aria-labelledby="domain-detail-title" onCancel={closeDetail} onClick={e=>{if(e.target===dialog.current)closeDetail()}}>{detail&&detailPremium&&<DomainDetails record={detail} premium={detailPremium} saved={saved.some(x=>x.domain===detail.domain)} busy={!!busy||checkingDomain} checking={checkingDomain} archived={recent} releaseCountdown={timeLeft(detail)} onClose={closeDetail} onSave={()=>save(detail.domain)}/>}</dialog>
 {toast&&<div className="toast" role="status"><Info size={18}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={17}/></button></div>}</div>
}
