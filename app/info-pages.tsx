'use client';
import {Radar,Globe2,Clock3,Bookmark,ArrowUpRight,ArrowRight,Database,ShieldCheck,Search,History} from 'lucide-react';
import type {FeedInfo} from '../lib/catalog';
import type {PageId} from '../lib/navigation';
const providers=[
 {name:'Backorder.sk',label:'SLOVAK RELEASE LIST',icon:Globe2,tlds:['sk'],description:'Held .sk domains with source-listed deletion days. The source does not publish an exact hour; in practice a deleted .sk name can usually be registered from about 02:00 Slovak time on the following day.',links:[{label:'Public release list',url:'https://www.backorder.sk/zadrzane'}]},
 {name:'CZ.NIC',label:'OFFICIAL .CZ AUCTION LIST',icon:ShieldCheck,tlds:['cz'],description:'The .cz registry itself. Expired .cz domains go to a public auction instead of being released straight away; CZ.NIC publishes them about 15 days ahead with exact start and end times. Unsold names are released the day after the auction.',links:[{label:'Domain auctions',url:'https://www.domenovyprohlizec.cz/cs/aukce-domen/'},{label:'Auction rules',url:'https://www.nic.cz/files/documents/Pravidla_aukci.pdf'}]},
 {name:'Dynadot',label:'GLOBAL RELEASE LISTS',icon:Database,tlds:['com','net','org','io','app','info','co','me','xyz','biz','us','pro','cc','tv'],description:'Public backorder listings with projected drop timestamps. Lists are loaded in pages. Load more to extend the selection; provider rate limits may temporarily pause pagination.',links:[{label:'Public backorder listings',url:'https://www.dynadot.com/market/backorder'}]},
];
export function SourcesPage({feeds}:{feeds:FeedInfo[]}){
 return <section className="information-page" aria-label="Sources and coverage"><div className="section-intro"><span className="eyebrow">FOLLOW THE EVIDENCE</span><h2>Every date has a source.</h2><p>Explore the providers behind the catalogue, their coverage and the limits of each list.</p></div><div className="provider-grid">{providers.map(provider=>{const rows=feeds.filter(f=>f.source===provider.name&&provider.tlds.includes(f.tld)),stamp=rows.length?Math.min(...rows.map(f=>Date.parse(f.checkedAt))):null;return <article className="provider-card" key={provider.name}><div className="provider-top"><span className="info-icon"><provider.icon size={23}/></span><span className="source-tag">{provider.label}</span></div><h3>{provider.name}</h3><div className="extension-tags">{provider.tlds.map(t=><span key={t}>.{t}</span>)}</div><p>{provider.description}</p><div className="provider-meta"><Clock3 size={13}/><span>{stamp&&Number.isFinite(stamp)?<>Last retrieval<br/><time dateTime={new Date(stamp).toISOString()}>{new Date(stamp).toLocaleString('en-GB')}</time></>:provider.name==='ExpiredDomains.net'?'Original retrieval time is attached to each historical report.':'Retrieval time appears after the feed loads.'}</span></div><div className="provider-links">{provider.links.map(link=><a href={link.url} key={link.url} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={15}/></a>)}</div></article>})}</div><div className="source-bottom-grid"><article className="explain-card"><ShieldCheck size={24}/><h3>A fresh registration check</h3><p>Opening a domain queries RDAP where supported. IANA’s bootstrap directory locates registry endpoints, so the check also works for extensions outside the catalogue (for example .ai, via Identity Digital). .sk details use Backorder.sk. An unavailable record is never treated as proof of availability.</p><a href="https://data.iana.org/rdap/dns.json" target="_blank" rel="noreferrer">IANA RDAP directory <ArrowUpRight size={15}/></a><a href="https://rdap.identitydigital.services/rdap/" target="_blank" rel="noreferrer">Identity Digital RDAP <ArrowUpRight size={15}/></a></article><article className="explain-card"><History size={24}/><h3>History, with its context</h3><p>Recently expired combines clearly labelled public deletion reports with observed listings whose projected release dates have passed, for up to 30 days. It grows as feeds are collected; there is no complete historical database for every extension. Original dates, retrieval times and attribution stay attached.</p><p>A past release estimate does not confirm expiry, deletion or availability today.</p></article></div><div className="info-callout"><ShieldCheck size={24}/><div><strong>Expiration and availability are different events.</strong><p>A holder may renew or restore a domain. Registry rules vary, and another buyer may register it as soon as it drops. Confirm availability with a registrar.</p></div><a href="https://www.icann.org/resources/pages/domain-name-renewal-expiration-faqs-2018-12-07-en" target="_blank" rel="noreferrer">Read ICANN’s guide <ArrowUpRight size={16}/></a></div></section>;
}
export function AboutPage({navigate}:{navigate:(tab:PageId)=>void}){
 return <section className="information-page" aria-label="About ScopeFlux"><div className="about-feature"><div><span className="eyebrow">THE IDEA BEHIND SCOPEFLUX</span><h2>A name for what<br/>you’re building next.</h2><p>ScopeFlux brings upcoming domain releases into one place, so you can discover names, compare extensions and understand when a domain might become available.</p><p>Built for founders, creators and anyone searching for a name for their next project.</p><button className="primary" onClick={()=>navigate('discover')}>Explore upcoming releases <ArrowRight size={17}/></button></div><div className="about-orbit" aria-hidden="true"><div className="orbit-core"><Radar size={62}/></div><span className="orbit-chip chip-one">.io</span><span className="orbit-chip chip-two">.com</span><span className="orbit-chip chip-three">.sk</span><span className="orbit-caption">A WORLD OF NAMES</span></div></div><div className="section-intro"><span className="eyebrow">FROM DISCOVERY TO A DECISION</span><h2>Your next name, in three steps.</h2></div><div className="feature-grid">{[{icon:Search,n:'01',title:'Find your direction',text:'Browse upcoming releases. Pick your extensions, search a keyword and narrow the list by date, length or premium potential.'},{icon:Clock3,n:'02',title:'Understand the timing',text:'Compare source-listed release estimates and countdowns. Recently expired lets you revisit names whose listed dates have passed.'},{icon:Bookmark,n:'03',title:'Keep it on your radar',text:'Save names to your account. Your watchlist refreshes when you visit or request a check, and flags changes after that check.'}].map(item=><article className="feature-card" key={item.n}><div><span className="info-icon"><item.icon size={23}/></span><span className="step-number">{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div><div className="about-principles"><div><span className="eyebrow">CLEAR DATES. HONEST EXPECTATIONS.</span><h2>Discovery with context.</h2><p>ScopeFlux is a discovery and monitoring tool. It does not register domains, place backorders or guarantee availability. Premium potential is a transparent name-quality heuristic, not a price appraisal.</p><button className="text-link" onClick={()=>navigate('how')}>See every stage and fee <ArrowRight size={16}/></button> <button className="text-link" onClick={()=>navigate('sources')}>Explore our sources <ArrowRight size={16}/></button></div><div className="lifecycle"><div><span>01</span><strong>Registration expires</strong><p>The holder may still be able to renew.</p></div><div><span>02</span><strong>Recovery or deletion stages</strong><p>The rules depend on the extension.</p></div><div><span>03</span><strong>Possible release</strong><p>The source estimate may change.</p></div><div><span>04</span><strong>Check current availability</strong><p>A registrar confirms whether you can register it.</p></div></div></div></section>;
}

export const CONTACT_EMAIL = 'hello@scopeflux.io';
const mail = <a href={'mailto:' + CONTACT_EMAIL}>{CONTACT_EMAIL}</a>;

// Plain description of what the site actually does with data. Keep it in step
// with the code: update it whenever storage, sign-in, analytics or ads change.
export function PrivacyPage() {
  return (
    <section className="information-page legal-page" aria-label="Privacy">
      <div className="section-intro">
        <span className="eyebrow">PRIVACY</span>
        <h2>What ScopeFlux stores, and why.</h2>
        <p>Last updated 17 October 2026.</p>
      </div>
      <h3>Who runs ScopeFlux</h3>
      <p>ScopeFlux is a personal project run from Slovakia. Questions about your data: {mail}.</p>
      <h3>Browsing without an account</h3>
      <p>You can use the catalogue, the history and the domain check without an account. ScopeFlux sets no analytics, advertising or tracking cookies and does not build a profile of you.</p>
      <p>When you check a domain, the name you typed is sent to public registration services (RDAP registries listed by IANA, and Backorder.sk for .sk details) to read its current status. ScopeFlux does not store which domains you looked up.</p>
      <h3>Visit statistics</h3>
      <p>To see how many people use the site, ScopeFlux uses Cloudflare Web Analytics. It counts page views and visits without cookies, without fingerprinting and without following you across other websites. The figures are only seen in aggregate.</p>
      <h3>Hosting</h3>
      <p>The site runs on Cloudflare. To deliver pages and protect the site, Cloudflare processes technical request data such as your IP address and browser type, and keeps short-lived logs. See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare’s privacy policy</a>.</p>
      <h3>Watchlist and sign-in</h3>
      <p>Signing in is optional and only needed for the watchlist. Sign-in is handled by Cloudflare Access, which sets a sign-in cookie (CF_Authorization) that is needed for the account to work. ScopeFlux stores your account identifier and the domains you save, with their last checked status, in its database until you remove them. To delete your watchlist, remove the domains or write to {mail}.</p>
      <h3>Your rights</h3>
      <p>Under the GDPR you can ask what data is held about you, and ask for it to be corrected or deleted. Write to {mail}. You can also complain to the Slovak data protection authority (Úrad na ochranu osobných údajov SR).</p>
      <h3>Advertising</h3>
      <p>ScopeFlux shows no advertising today. If that changes, this page will be updated before any ad is shown, and ads will only load after you agree.</p>
    </section>
  );
}

export function ContactPage() {
  return (
    <section className="information-page legal-page" aria-label="Contact">
      <div className="section-intro">
        <span className="eyebrow">CONTACT</span>
        <h2>Get in touch.</h2>
        <p>Questions, corrections to a listing, ideas or data requests: write to {mail}.</p>
      </div>
      <p>ScopeFlux shows release estimates from public sources. It cannot reserve, buy or transfer domains. To register a domain, use a registrar.</p>
    </section>
  );
}
